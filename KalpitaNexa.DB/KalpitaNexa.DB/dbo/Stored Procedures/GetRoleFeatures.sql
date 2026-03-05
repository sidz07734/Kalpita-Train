
CREATE PROCEDURE [dbo].[GetRoleFeatures]
/*
	Object Name : dbo.GetRoleFeatures
	Object Type : StoredProcedure
	Created Date: 31-10-2025
	Created By  : Archana Gudise
	Purpose     : Fetches active feature IDs AND NAMES for a given role name, tenant, and application.
*/
(
    @TenantId UNIQUEIDENTIFIER,
    @AppId INT,
    @RoleName NVARCHAR(200)
)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @RoleId INT;

    -- Step 1: Find the active RoleId from the Roles table. This query is specific
    -- to prevent fetching the wrong role if names are duplicated across tenants.
    SELECT @RoleId = r.RoleId
    FROM [dbo].[Roles] AS r
    WHERE
        r.RoleName = @RoleName
        AND r.TenantId = @TenantId
        AND r.AppId = @AppId
        AND r.IsActive = 1;

    -- Step 2: If a valid RoleId is found, retrieve the corresponding [dbo].[Features] and their names.
    IF @RoleId IS NOT NULL
    BEGIN
        -- Step 3: Join [dbo].[RoleFeatures] with the [dbo].[Features] table to get the names.
        -- This ensures that the role-feature mapping is active AND the feature itself is active.
        SELECT
            f.FeatureId,
            f.FeatureName
        FROM
            [dbo].[RoleFeatures] AS rf
        INNER JOIN
            [dbo].[Features] AS f ON rf.FeatureId = f.FeatureId
        WHERE
            rf.RoleId = @RoleId
            AND rf.AppId = @AppId -- Ensures [dbo].[Features] are contextually correct for the app
            AND rf.IsActive = 1   -- Ensures the role-to-feature mapping is active
            AND f.IsActive = 1;   -- Ensures the feature itself is active in the master table
    END
END