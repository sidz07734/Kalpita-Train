
CREATE PROCEDURE [dbo].[spDeleteTenant]
/*
	Object Name : dbo.spDeleteTenant
	Object Type : StoredProcedure
	Created Date: 06-10-2025
	Created By  : Archana Gudise
	Purpose     : Logically deletes a tenant by setting IsActive to 0.
*/
(
    @TenantId UNIQUEIDENTIFIER,
    @RequestingUserId UNIQUEIDENTIFIER
)
AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @IsSuperAdmin BIT;
    DECLARE @RequestingUserEmail NVARCHAR(300);

    -- Step 1: Verify the requesting user is a Super Admin
    SELECT 
        @IsSuperAdmin = IsSuperAdmin,
        @RequestingUserEmail = UserEmail
    FROM dbo.Users 
    WHERE UserId = @RequestingUserId AND IsActive = 1;

    IF @IsSuperAdmin = 0 OR @IsSuperAdmin IS NULL
    BEGIN
        SELECT 'Permission denied. Only Super Admins can delete tenants.' AS Message, 0 AS Success;
        RETURN;
    END
    
    -- Step 2: Begin Transaction
    BEGIN TRANSACTION;

    BEGIN TRY
        -- Step 3: Deactivate the Tenant
        UPDATE dbo.Tenants
        SET 
            IsActive = 0,
            ModifiedOn = SYSUTCDATETIME(),
            ModifiedBy = @RequestingUserEmail
        WHERE TenantId = @TenantId;

        -- Step 4: Deactivate the associated Application(s)
        UPDATE [dbo].[Application]
        SET 
            IsActive = 0,
            ModifiedOn = SYSUTCDATETIME(),
            ModifiedBy = @RequestingUserEmail
        WHERE TenantId = @TenantId;

        -- Step 5: Deactivate user links to the tenant
        UPDATE dbo.UserRoles
        SET 
            IsActive = 0,
            ModifiedOn = SYSUTCDATETIME(),
            ModifiedBy = @RequestingUserEmail
        WHERE TenantId = @TenantId;

        COMMIT TRANSACTION;
        SELECT 'Tenant deleted successfully.' AS Message, 1 AS Success;

    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION;
        SELECT ERROR_MESSAGE() AS Message, 0 AS Success;
    END CATCH
END;