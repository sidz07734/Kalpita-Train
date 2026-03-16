CREATE PROCEDURE [dbo].[spGetTenants]
/*
	Object Name : dbo.spGetUserRoles
	Object Type : StoredProcedure
	Created Date: 18-09-2025
	Created By  : Kalpataru sahoo
	Purpose     : Finds a user by email, generates a 6-digit OTP, and stores it in the UserOtps table.
*/
AS
BEGIN
    SET NOCOUNT ON;
    SELECT 
        TenantId,
        TenantName,
        IsActive,
        CreatedOn,
        CreatedBy,
        ModifiedOn,
        ModifiedBy
    FROM dbo.Tenants
    WHERE IsActive = 1
    ORDER BY TenantName ASC;
END