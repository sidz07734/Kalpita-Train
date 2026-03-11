
CREATE    PROCEDURE [dbo].[spGetRolesWithFeaturesByTenant]
/*
    Object Name : dbo.spGetRolesWithFeaturesByTenant
    Object Type : StoredProcedure
    Created Date: 19-09-2025
	Modified Date: 01-10-2025
    Created By  : Vyshnavi Atthuluri
    Purpose     : Retrieves all active roles and their associated features for a specific TenantId and AppId.
*/
(
    @TenantId UNIQUEIDENTIFIER,
    @AppId INT
)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT 
        r.RoleId,
        r.RoleName,
        STRING_AGG(f.FeatureName, ', ') AS FeatureNames,
        r.IsActive,
        r.CreatedOn,
        r.CreatedBy,
        r.ModifiedOn,
        r.ModifiedBy
    FROM dbo.Roles AS r
    INNER JOIN dbo.RoleFeatures AS rf 
        ON r.RoleId = rf.RoleId
       AND r.AppId = rf.AppId
       AND rf.IsActive = 1          -- ✅ Only active role-feature mappings
    INNER JOIN dbo.Features AS f 
        ON rf.FeatureId = f.FeatureId
       AND f.IsActive = 1           -- ✅ Only active features
    WHERE 
        r.IsActive = 1
        AND r.TenantId = @TenantId
        AND r.AppId = @AppId
    GROUP BY 
        r.RoleId, r.RoleName, r.IsActive, r.CreatedOn, r.CreatedBy, r.ModifiedOn, r.ModifiedBy;
END