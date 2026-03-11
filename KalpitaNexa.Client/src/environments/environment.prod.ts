export const environment = {
    production: true,
  envName: 'production',
    apiUrl: 'https://kalpitanexaapi.azurewebsites.net/api',
     msalConfig: {
        auth: {
            clientId: 'fe4d27b6-586e-4f94-adc4-bbb4de5d87af', // Replace with your Client ID
            authority: 'https://login.microsoftonline.com/8049d4ef-045b-4505-8745-7bca3a5691a3', // Replace with your Tenant ID
            redirectUri: 'https://kalpitanexaclient.azurewebsites.net/', // Must match your App Registration's redirect URI
        },
        cache: {
            cacheLocation: 'localStorage',
            storeAuthStateInCookie: false,
        }
    }
};
