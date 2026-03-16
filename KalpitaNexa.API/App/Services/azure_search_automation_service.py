import httpx
import logging
import base64
import pandas as pd
import io
import requests
import msal
from azure.search.documents import SearchClient
from azure.search.documents.indexes import SearchIndexClient
from azure.core.credentials import AzureKeyCredential
from azure.search.documents.indexes.models import SearchIndex, SimpleField, SearchableField, SearchFieldDataType
import asyncio

logger = logging.getLogger(__name__)

class AzureSearchAutomationService:
    def __init__(self, endpoint: str, admin_key: str):
        self.endpoint = endpoint
        self.admin_key = admin_key
        self.headers = {
            "Content-Type": "application/json",
            "api-key": admin_key
        }

    def _get_graph_token(self, config):
        app = msal.ConfidentialClientApplication(
            config['app_id'],
            authority=f"https://login.microsoftonline.com/{config['tenant_id']}",
            client_credential=config['app_secret'],
        )
        token = app.acquire_token_for_client(scopes=["https://graph.microsoft.com/.default"])
        return token.get("access_token")

    async def create_unstructured_resources(self, ds_name, config):
        """Automates Data Source, Index, and Indexer with Citation Links"""
        api_version = "2024-05-01-preview"
        
        # Site URL preparation
        full_site_url = config['spo_endpoint'].strip().rstrip('/')
        path = config.get('folder_path', '').strip()
        if path and not path.startswith('/'):
            path = '/' + path
        
        # SharePoint Site URL for connection string
        target_site = full_site_url + path

        # 1. Create Data Source
        ds_payload = {
            "name": f"{ds_name}-ds",
            "type": "sharepoint",
            "credentials": {
                "connectionString": f"SharePointOnlineEndpoint={target_site};ApplicationId={config['app_id']};ApplicationSecret={config['app_secret']};TenantId={config['tenant_id']}"
            },
            "container": {
                "name": "defaultSiteLibrary",
                "query": f"includeLibrariesInSite={target_site}" # Matches your script
            }
        }
        
        # 2. Create Index with all metadata fields + citation_link
        index_payload = {
            "name": f"{ds_name}-index",
            "fields": [
                { "name": "id", "type": "Edm.String", "key": True, "searchable": False },
                { "name": "metadata_spo_item_name", "type": "Edm.String", "searchable": True, "filterable": False, "sortable": False, "facetable": False },
                { "name": "metadata_spo_item_path", "type": "Edm.String", "searchable": False, "filterable": False, "sortable": False, "facetable": False, "retrievable": True },
                { "name": "metadata_spo_item_content_type", "type": "Edm.String", "searchable": False, "filterable": True, "sortable": False, "facetable": True },
                { "name": "metadata_spo_item_last_modified", "type": "Edm.DateTimeOffset", "searchable": False, "filterable": False, "sortable": True, "facetable": False },
                { "name": "metadata_spo_item_size", "type": "Edm.Int64", "searchable": False, "filterable": False, "sortable": False, "facetable": False },
                { "name": "content", "type": "Edm.String", "searchable": True, "filterable": False, "sortable": False, "facetable": False },
                { "name": "citation_link", "type": "Edm.String", "searchable": False, "filterable": False, "sortable": False, "facetable": False, "retrievable": True }
            ]
        }

        # 3. Create Indexer with field mappings for citation_link
        indexer_payload = {
            "name": f"{ds_name}-indexer",
            "dataSourceName": ds_payload["name"],
            "targetIndexName": index_payload["name"],
            "parameters": {
                "configuration": {
                    "indexedFileNameExtensions": ".pdf,.docx",
                    "excludedFileNameExtensions": ".png,.jpg,.jpeg",
                    "dataToExtract": "contentAndMetadata",
                    "failOnUnsupportedContentType": False,
                    "failOnUnprocessableDocument": False # Help bypass minor doc errors
                },
                # Handle the "Term too large" error by allowing some failures 
                # or limiting content size if necessary
                "maxFailedItems": -1, 
                "maxFailedItemsPerBatch": -1
            },
            "schedule": { "interval": "PT24H" },
            "fieldMappings": [
                {
                    "sourceFieldName": "metadata_spo_site_library_item_id",
                    "targetFieldName": "id",
                    "mappingFunction": { "name": "base64Encode" }
                },
                {
                    "sourceFieldName": "metadata_spo_item_path",
                    "targetFieldName": "metadata_spo_item_path"
                },
                {
                    "sourceFieldName": "metadata_spo_item_weburi",
                    "targetFieldName": "citation_link" # Mapped to your citation field
                }
            ]
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            # Step A: Data Source
            r1 = await client.post(f"{self.endpoint}/datasources?api-version={api_version}", json=ds_payload, headers=self.headers)
            if r1.status_code not in [200, 201]:
                raise Exception(f"Azure DS Error: {r1.text}")

            # Step B: Index
            r2 = await client.post(f"{self.endpoint}/indexes?api-version={api_version}", json=index_payload, headers=self.headers)
            if r2.status_code not in [200, 201]:
                raise Exception(f"Azure Index Error: {r2.text}")

            await asyncio.sleep(7)

            # Step C: Indexer
            r3 = await client.post(f"{self.endpoint}/indexers?api-version={api_version}", json=indexer_payload, headers=self.headers)
            if r3.status_code not in [200, 201]:
                raise Exception(f"Azure Indexer Error: {r3.text}")
        
        return {"index_name": index_payload["name"], "ds_azure_name": ds_payload["name"]}

    async def create_structured_resources(self, ds_name, fields_config, infra_config):
        import urllib.parse
        import re
        
        # --- STEP 1: CREATE INDEX ---
        client = SearchIndexClient(endpoint=self.endpoint, credential=AzureKeyCredential(self.admin_key))
        fields = [SimpleField(name="id", type=SearchFieldDataType.String, key=True, retrievable=True)]
        for field in fields_config:
            if field['name'].lower() == 'id': continue
            
            if field.get('searchable') and field['type'] == "Edm.String":
                fields.append(SearchableField(name=field['name'], type=field['type'], filterable=field.get('filterable', True), retrievable=True))
            else:
                fields.append(SimpleField(name=field['name'], type=field['type'], filterable=field.get('filterable', True), retrievable=True))
        
        index_name = f"{ds_name}-index"
        client.create_or_update_index(SearchIndex(name=index_name, fields=fields))
        logger.info(f"✅ Structured Index {index_name} created.")

        # --- STEP 2: DATA PUSH ---
        try:
            token = self._get_graph_token(infra_config)
            headers = {"Authorization": f"Bearer {token}"}
            
            site_url = f"https://graph.microsoft.com/v1.0/sites/{infra_config['spo_hostname']}:{infra_config['spo_site_path']}"
            site_resp = requests.get(site_url, headers=headers).json()
            site_id = site_resp["id"]

            drives_resp = requests.get(f"https://graph.microsoft.com/v1.0/sites/{site_id}/drives", headers=headers).json()
            drive_id = next((d["id"] for d in drives_resp.get("value", []) if d["name"] == "Documents"), drives_resp["value"][0]["id"])

            folder_path = urllib.parse.quote(infra_config['folder_path'].strip('/'))
            files_url = f"https://graph.microsoft.com/v1.0/drives/{drive_id}/root{':/' + folder_path + ':' if folder_path else ''}/children"
            
            files_resp = requests.get(files_url, headers=headers).json()
            files = files_resp.get("value", [])

            search_client = SearchClient(self.endpoint, index_name, AzureKeyCredential(self.admin_key))

            for f in files:
                if f["name"].lower().endswith((".xls", ".xlsx")):
                    file_content = requests.get(f["@microsoft.graph.downloadUrl"], headers=headers).content
                    df = pd.read_excel(io.BytesIO(file_content))
                    
                    raw_columns = list(df.columns)
                    clean_columns = [re.sub(r'[^a-zA-Z0-9]', '', str(c)).lower() for c in raw_columns]
                    col_map = dict(zip(clean_columns, raw_columns))
                    
                    docs = []
                    for idx, row in df.iterrows():
                        doc = {"id": base64.urlsafe_b64encode(f"{ds_name}-{idx}".encode()).decode().replace('=','')}
                        parsed_dt = None

                        for field in fields_config:
                            ui_name = field['name']
                            clean_ui_name = re.sub(r'[^a-zA-Z0-9]', '', ui_name).lower()
                            
                            # --- BETTER MATCHING LOGIC ---
                            found_col = None
                            # 1. Try Exact Match (e.g., SlNo == slno)
                            if clean_ui_name in clean_columns:
                                found_col = col_map[clean_ui_name]
                            # 2. Try Smart Date Match (If UI field has 'date', only match Excel cols with 'date')
                            elif "date" in clean_ui_name:
                                for c_ex in clean_columns:
                                    if "date" in c_ex:
                                        found_col = col_map[c_ex]
                                        break
                            # 3. Try Smart Name Match (e.g., HolidayName matches Holiday)
                            elif "name" in clean_ui_name or "holiday" in clean_ui_name:
                                for c_ex in clean_columns:
                                    if "holiday" in c_ex and "date" not in c_ex:
                                        found_col = col_map[c_ex]
                                        break
                            # 4. Fallback Fuzzy
                            else:
                                for c_ex in clean_columns:
                                    if c_ex in clean_ui_name:
                                        found_col = col_map[c_ex]
                                        break
                            
                            if found_col and not pd.isna(row[found_col]):
                                val = row[found_col]
                                if "Int" in field['type']: 
                                    doc[ui_name] = int(val)
                                elif "DateTime" in field['type']: 
                                    # Use errors='coerce' to prevent crashing on bad strings
                                    temp_dt = pd.to_datetime(val, errors='coerce')
                                    if pd.notnull(temp_dt):
                                        parsed_dt = temp_dt
                                        doc[ui_name] = parsed_dt.isoformat() + "Z"
                                else: 
                                    doc[ui_name] = str(val)
                            
                            # Fill Calculated Fields (Month, Day, etc.)
                            if ui_name not in doc or doc[ui_name] is None:
                                if parsed_dt:
                                    if "Month" in ui_name: doc[ui_name] = parsed_dt.strftime("%B")
                                    elif "DateString" in ui_name: doc[ui_name] = parsed_dt.strftime("%d-%b-%Y")
                                    elif "DayOfWeek" in ui_name or "Day" in ui_name: doc[ui_name] = parsed_dt.strftime("%A")

                        docs.append(doc)

                    if docs:
                        search_client.upload_documents(docs)
                        logger.info(f"✅ Successfully uploaded {len(docs)} rows from {f['name']}")

        except Exception as push_err:
            logger.error(f"❌ Data push failed: {push_err}")
            
        return {"index_name": index_name}