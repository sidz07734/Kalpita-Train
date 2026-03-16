
CREATE PROCEDURE [dbo].[spGetTenantDetailsById]
/*
	Object Name : dbo.spUpdateTenant
	Object Type : StoredProcedure
	Created Date: 06-10-2025
	Created By  : Archana Gudise
	Purpose     : Fetches the full details for a single tenant, including its assigned [dbo].[Applications] and features.
*/

    @TenantId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;

    -- Step 1: Fetch the basic tenant information
    SELECT
        t.TenantId,
        t.TenantName,
        t.IsActive,
        t.CreatedOn,
        t.CreatedBy
    FROM
        dbo.Tenants AS t
    WHERE
        t.TenantId = @TenantId AND t.IsActive = 1;

    -- Step 2: Fetch the [dbo].[Applications] assigned to this tenant
    SELECT
        a.AppId AS application_id,
        a.ApplicationName AS application_name
    FROM
        [dbo].[Application] AS a
    WHERE
        a.TenantId = @TenantId AND a.IsActive = 1;

    -- Step 3: Fetch the [dbo].[Features] assigned to this tenant
    -- This joins through the TenantFeatureMapping table
    SELECT
        f.FeatureId AS feature_id,
        f.FeatureName AS feature_name
    FROM
        [dbo].[Features] AS f
    INNER JOIN
        dbo.TenantFeatureMapping AS tfm ON f.FeatureId = tfm.FeatureId
    WHERE
        tfm.TenantId = @TenantId AND f.IsActive = 1 AND tfm.IsActive = 1;

END