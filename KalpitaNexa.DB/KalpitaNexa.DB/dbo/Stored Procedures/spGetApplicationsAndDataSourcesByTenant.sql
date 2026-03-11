

CREATE PROCEDURE [dbo].[spGetApplicationsAndDataSourcesByTenant] 
/*
Object Name : dbo.spGetApplicationsAndDataSourcesByTenant
Object Type : StoredProcedure
Created Date: 01-10-2025
Created By  : Archana Gudise
Modified Date : 23-10-2025
Purpose     : Retrieves all active [dbo].[Applications] and their associated active data sources for a given TenantId.
*/
(
    @TenantId UNIQUEIDENTIFIER
)
AS
BEGIN
    SET NOCOUNT ON;

    -- Step 1: Select details by joining through the TenantApplication table.
    -- This correctly finds which master [dbo].[Applications] are assigned to the tenant.
    SELECT
        a.AppId,
        a.ApplicationName,
        d.DataSourceId,
        d.DataSourceName
    FROM
        -- START HERE: Find the app assignments for the tenant
        [dbo].[TenantApplication] AS ta
        -- Now get the application details from the master list
        INNER JOIN [dbo].[Application] AS a ON ta.AppId = a.AppId
        -- The rest of the joins remain the same
        INNER JOIN [dbo].[ApplicationDataSources] AS ad ON a.AppId = ad.AppId
        INNER JOIN [dbo].[DataSources] AS d ON ad.DataSourceId = d.DataSourceId
    WHERE
        ta.TenantId = @TenantId  -- The main filter is now on the mapping table
        AND a.IsActive = 1
        AND ad.IsActive = 1
        AND d.IsActive = 1
    ORDER BY
        a.ApplicationName,
        d.DataSourceName;
END