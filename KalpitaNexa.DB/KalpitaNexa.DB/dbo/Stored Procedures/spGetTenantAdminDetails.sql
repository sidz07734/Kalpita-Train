CREATE PROCEDURE spGetTenantAdminDetails
/*
	Object Name : dbo.spGetUserRoles
	Object Type : StoredProcedure
	Created Date: 18-09-2025
	Created By  : Kalpataru sahoo
	Purpose     : Finds a user by email, generates a 6-digit OTP, and stores it in the UserOtps table.
*/
    @AdminId UNIQUEIDENTIFIER,
    @TenantId UNIQUEIDENTIFIER
AS
BEGIN
    SELECT 
        @TenantId AS TenantId,
        u.UserId AS TenantAdminId,
        u.UserName AS TenantAdminName,
        u.UserEmail,
        STRING_AGG(CAST(tfm.FeatureId AS NVARCHAR), ',') AS FeatureIds,
        STRING_AGG(f.FeatureName, ',') AS FeatureNames,
        tu.RoleId,
        r.RoleName,
        u.IsActive,
        u.CreatedOn,
        u.CreatedBy,
        u.ModifiedOn,
        u.ModifiedBy
    FROM dbo.Users u
    INNER JOIN dbo.UserRoles tu
      ON u.UserId = tu.UserId AND tu.TenantId = @TenantId
    INNER JOIN dbo.Roles r
      ON tu.RoleId = r.RoleId
    LEFT JOIN dbo.TenantFeatureMapping tfm
      ON tfm.TenantId = @TenantId AND tfm.IsActive = 1
    LEFT JOIN dbo.Features f
      ON tfm.FeatureId = f.FeatureId
    WHERE u.UserId = @AdminId
      AND u.IsActive = 1
    GROUP BY
      u.UserId, u.UserName, u.UserEmail,
      tu.RoleId, r.RoleName,
      u.IsActive, u.CreatedOn,
      u.CreatedBy, u.ModifiedOn,
      u.ModifiedBy;
END