

CREATE PROCEDURE [dbo].[spGetAllApplicationsWithSettings]

/*
    Object Name : dbo.spGetAllApplicationsWithSettings
    Object Type : StoredProcedure
    Purpose     : Retrieves settings for a specific AppId within a specific Tenant.
                  Both parameters are mandatory.
*/
AS
BEGIN
    SET NOCOUNT ON;

    -- Validate inputs
    

    SELECT
        A.AppId,
        A.TenantId,
        T.TenantName,
        A.ClientId,
        A.ApplicationName,
        A.IsActive,
        A.CreatedOn,
        A.CreatedBy,
        A.ModifiedOn,
        A.ModifiedBy,

        ALang.AssignedLanguages,
        ALangIds.AssignedLanguageIds,
        AMod.AssignedModels,
        AModIds.AssignedModelIds,
        AData.AssignedDataSources,
        ADataIds.AssignedDataSourceIds
    FROM
        [dbo].[Application] AS A
    INNER JOIN
        dbo.Tenants AS T ON A.TenantId = T.TenantId

    -- Languages
    OUTER APPLY (
        SELECT STRING_AGG(LanguageName, ', ') AS AssignedLanguages
        FROM (
            SELECT DISTINCT L.LanguageName
            FROM dbo.ApplicationLanguages AL2
            INNER JOIN dbo.Languages L ON AL2.LanguageId = L.LanguageID
            WHERE AL2.AppId = A.AppId AND AL2.IsActive = 1
        ) AS t
    ) AS ALang

    OUTER APPLY (
        SELECT STRING_AGG(CAST(LanguageID AS NVARCHAR(10)), ',') AS AssignedLanguageIds
        FROM (
            SELECT DISTINCT L.LanguageID
            FROM dbo.ApplicationLanguages AL2
            INNER JOIN dbo.Languages L ON AL2.LanguageId = L.LanguageID
            WHERE AL2.AppId = A.AppId AND AL2.IsActive = 1
        ) AS t
    ) AS ALangIds

    -- Models
    OUTER APPLY (
        SELECT STRING_AGG(ModuleName, ', ') AS AssignedModels
        FROM (
            SELECT DISTINCT M.ModuleName
            FROM dbo.ApplicationModels AM2
            INNER JOIN dbo.Model M ON AM2.ModuleID = M.ModuleID
            WHERE AM2.AppId = A.AppId AND AM2.IsActive = 1
        ) AS t
    ) AS AMod

    OUTER APPLY (
        SELECT STRING_AGG(CAST(ModuleID AS NVARCHAR(10)), ',') AS AssignedModelIds
        FROM (
            SELECT DISTINCT M.ModuleID
            FROM dbo.ApplicationModels AM2
            INNER JOIN dbo.Model M ON AM2.ModuleID = M.ModuleID
            WHERE AM2.AppId = A.AppId AND AM2.IsActive = 1
        ) AS t
    ) AS AModIds

    -- Data Sources
    OUTER APPLY (
        SELECT STRING_AGG(DataSourceName, ', ') AS AssignedDataSources
        FROM (
            SELECT DISTINCT DS.DataSourceName
            FROM dbo.ApplicationDataSources ADS2
            INNER JOIN dbo.DataSources DS ON ADS2.DataSourceId = DS.DataSourceId
            WHERE ADS2.AppId = A.AppId AND ADS2.IsActive = 1
        ) AS t
    ) AS AData

    OUTER APPLY (
        SELECT STRING_AGG(CAST(DataSourceId AS NVARCHAR(10)), ',') AS AssignedDataSourceIds
        FROM (
            SELECT DISTINCT DS.DataSourceId
            FROM dbo.ApplicationDataSources ADS2
            INNER JOIN dbo.DataSources DS ON ADS2.DataSourceId = DS.DataSourceId
            WHERE ADS2.AppId = A.AppId AND ADS2.IsActive = 1
        ) AS t
    ) AS ADataIds

    WHERE
        A.IsActive = 1
     
END