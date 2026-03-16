
CREATE PROCEDURE [dbo].[spGetAllRoles]
/*
	Object Name : dbo.spGetAllRoles
	Object Type : StoredProcedure
	Created Date: 18-09-2025
	Created By  : Kalpataru sahoo
	Purpose     : Gets all active dbo.Roles in the system
*/
 @TenantId UNIQUEIDENTIFIER 
AS
BEGIN
    SET NOCOUNT ON;
    
    SELECT RoleId, RoleName
    FROM Roles
    WHERE IsActive = 1
	AND TenantId = @TenantId 
    ORDER BY RoleName;
END