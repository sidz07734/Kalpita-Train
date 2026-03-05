SUBSCRIPTION="Visual Studio Enterprise Subscription – MPN (Azure DevOps)"
RESOURCEGROUP="ChatBot_ArcKa"
LOCATION="eastus"
PLANNAME="ASP-ChatBotArcKa-ab58"
PLANSKU="B1"
SITENAME="kalpitaagent-dev"
RUNTIME="PYTHON|3.11"


# specify the node version your app requires
az webapp config set --resource-group  $RESOURCEGROUP --name $SITENAME --startup-file 'uvicorn main:app --host 0.0.0.0 --port 8000'
# To set up deployment from a local git repository, uncomment the following commands.
# first, set the username and password (use environment variables!)
# USERNAME=""
# PASSWORD=""
# az webapp deployment user set --user-name $USERNAME --password $PASSWORD

# now, configure the site for deployment. in this case, we will deploy from the local git repository
# you can also configure your site to be deployed from a remote git repository or set up a CI/CD workflow
# az webapp deployment source config-local-git --name $SITENAME --resource-group $RESOURCEGROUP

# the previous command returned the git remote to deploy to
# use this to set up a new remote named "azure"
# git remote add azure "https://$USERNAME@$SITENAME.scm.azurewebsites.net/$SITENAME.git"
# push master to deploy the site
# git push azure master

# browse to the site
# az webapp browse --name $SITENAME --resource-group $RESOURCEGROUP
