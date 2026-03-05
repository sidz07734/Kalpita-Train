CREATE PROCEDURE[dbo].[spGetTenantAdmins]
/*
	Object Name : dbo.spGetTenantAdmins
	Object Type : StoredProcedure
	Created Date: 18-09-2025
	Created By  : Kalpataru sahoo
	Purpose     : Gets tenant admins with tenant-level features
*/
    @TenantId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    
    SELECT 
        u.UserId,
        u.UserName,
        u.UserEmail,
        tu.RoleId,
        r.RoleName,
        tu.IsActive,
        tu.CreatedOn,
        tu.CreatedBy,
        STRING_AGG(CAST(tfm.FeatureId AS NVARCHAR), ',') as AssignedFeatures,
        STRING_AGG(f.FeatureName, '|') as FeatureNames
    FROM dbo.Users u
    INNER JOIN dbo.UserRoles tu ON u.UserId = tu.UserId
    INNER JOIN dbo.Roles r ON tu.RoleId = r.RoleId
    LEFT JOIN dbo.TenantFeatureMapping tfm ON tu.TenantId = tfm.TenantId AND tfm.IsActive = 1
    LEFT JOIN dbo.Features f ON tfm.FeatureId = f.FeatureId AND f.IsActive = 1
    WHERE tu.TenantId = @TenantId 
        AND u.IsActive = 1 
        AND tu.IsActive = 1
        AND r.IsActive = 1
    GROUP BY u.UserId, u.UserName, u.UserEmail, tu.RoleId, r.RoleName, 
             tu.IsActive, tu.CreatedOn, tu.CreatedBy
    ORDER BY u.UserName;
END