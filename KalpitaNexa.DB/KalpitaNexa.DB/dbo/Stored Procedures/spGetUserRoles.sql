CREATE PROCEDURE [dbo].[spGetUserRoles]

/*
	Object Name : dbo.spGetUserRoles
	Object Type : StoredProcedure
	Created Date: 17-09-2025
	Created By  : Kalpataru sahoo
	Purpose     : Finds a user by email, generates a 6-digit OTP, and stores it in the UserOtps table.
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
        tu.CreatedBy
    FROM dbo.Users u
    INNER JOIN dbo.UserRoles tu ON u.UserId = tu.UserId
    INNER JOIN dbo.Roles r ON tu.RoleId = r.RoleId
    WHERE tu.TenantId = @TenantId 
        AND u.IsActive = 1 
        AND tu.IsActive = 1
        AND r.IsActive = 1
    ORDER BY u.UserName;
END