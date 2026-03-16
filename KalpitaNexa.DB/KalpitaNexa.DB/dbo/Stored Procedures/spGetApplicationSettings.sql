

CREATE PROCEDURE [dbo].[spGetApplicationSettings]
/*
    Object Name : dbo.spGetApplicationSettings
    Object Type : StoredProcedure
    Created Date: 23-09-2025
    Created By  : Kalpataru Sahoo
    Purpose     : Returns all active settings for a specific application with the CORRECT IDs.
*/
    @AppId INT
AS
BEGIN
    SET NOCOUNT ON;
    
    -- Languages
    SELECT 
        l.LanguageID,       -- CORRECT: Select the ID from the Languages table
        l.LanguageName, 
        al.IsDefault, 
        al.IsActive
    FROM [dbo].[ApplicationLanguages] al
    INNER JOIN dbo.Languages l ON al.LanguageId = l.LanguageID
    WHERE al.AppId = @AppId AND al.IsActive = 1;

    -- Models
    SELECT 
        m.ModuleID,         -- CORRECT: Select the ID from the [dbo].[Model] table
        m.ModuleName, 
        am.IsDefault, 
        am.IsActive
    FROM [dbo].[ApplicationModels] am
    INNER JOIN [dbo].[Model] m ON am.ModuleID = m.ModuleID
    WHERE am.AppId = @AppId AND am.IsActive = 1;

    -- DataSources
    SELECT 
        ds.DataSourceId,    -- CORRECT: Select the ID from the DataSources table
        ds.DataSourceName, 
        ad.IsDefault, 
        ad.IsActive
    FROM [dbo].[ApplicationDataSources] ad
    INNER JOIN dbo.DataSources ds ON ad.DataSourceId = ds.DataSourceId
    WHERE ad.AppId = @AppId AND ad.IsActive = 1;

	SELECT
        MonthlyCredits,
        TokensPerCredit, -- Note: Your table schema has TokensPerCredit, not TokensPerCredits
        ChatHistoryInDays,
		ConfidentialScore
    FROM
        [dbo].[ApplicationSettings]
    WHERE
        AppId = @AppId
        AND IsActive = 1;

END