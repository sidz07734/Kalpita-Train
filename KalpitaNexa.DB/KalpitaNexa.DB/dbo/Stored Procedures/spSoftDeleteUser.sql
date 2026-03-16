 
CREATE PROCEDURE [dbo].[spSoftDeleteUser]
/*
	Object Name : dbo.spSoftDeleteUser
	Object Type : StoredProcedure
	Created Date: 17-09-2025
	Created By  : Archana Gudise
	Purpose     : Soft deletes (deactivates) a user in both the Users and UserRoles tables.
	              Includes permission checks to ensure only authorized admins can perform the action.
*/
(
    @ExecutingUserEmail NVARCHAR(300), -- The email of the admin performing the delete
    @TenantId           UNIQUEIDENTIFIER,   -- The tenant context for the delete
    @UserIdToDelete     UNIQUEIDENTIFIER    -- The unique ID of the user to be deactivated
)
AS
BEGIN
    SET NOCOUNT ON;
 
    DECLARE @ExecutingUserId UNIQUEIDENTIFIER;
    DECLARE @IsSuperAdmin BIT;
    DECLARE @CanPerformAction BIT = 0;
 
    -- Step 1: Permission Check - Verify the executing user is authorized
    SELECT @ExecutingUserId = UserId, @IsSuperAdmin = IsSuperAdmin
    FROM dbo.Users
    WHERE UserEmail = @ExecutingUserEmail AND IsActive = 1;
 
    IF @ExecutingUserId IS NULL
    BEGIN
        RAISERROR('Executing user not found or is inactive.', 16, 1);
        RETURN;
    END
    
    IF @IsSuperAdmin = 1
    BEGIN
        SET @CanPerformAction = 1; -- Super Admins can delete any user
    END
    ELSE
    BEGIN
        -- Non-Super Admins must be an 'Admin' of the specified tenant
        IF EXISTS (
            SELECT 1 FROM dbo.UserRoles tu
            JOIN dbo.Roles r ON tu.RoleId = r.RoleId
            WHERE tu.UserId = @ExecutingUserId AND tu.TenantId = @TenantId AND r.RoleName = 'Admin' AND tu.IsActive = 1
        )
        BEGIN
            SET @CanPerformAction = 1;
        END
    END
 
    IF @CanPerformAction = 0
    BEGIN
        RAISERROR('Permission denied. User is not authorized to delete users in this tenant.', 16, 1);
        RETURN;
    END
 
    -- Step 2: Validate that the user being deleted belongs to the specified tenant
    IF NOT EXISTS (SELECT 1 FROM dbo.UserRoles WHERE UserId = @UserIdToDelete AND TenantId = @TenantId)
    BEGIN
        RAISERROR('The user to be deleted does not belong to the specified tenant.', 16, 1);
        RETURN;
    END
 
    -- Step 3: Perform the soft delete within a transaction
    BEGIN TRANSACTION;
    BEGIN TRY
        -- Deactivate in the central Users table
        UPDATE dbo.Users
        SET 
            IsActive = 0, 
            ModifiedOn = GETUTCDATE(), 
            ModifiedBy = @ExecutingUserEmail
        WHERE 
            UserId = @UserIdToDelete;
 
        -- Deactivate the user's link to this specific tenant
        UPDATE dbo.UserRoles
        SET 
            IsActive = 0, 
            ModifiedOn = GETUTCDATE(), 
            ModifiedBy = @ExecutingUserEmail
        WHERE 
            UserId = @UserIdToDelete AND TenantId = @TenantId;
 
        COMMIT TRANSACTION;
 
        -- Step 4: Return a consistent success message
        SELECT 'User deactivated successfully.' AS Message, 1 AS Success;
 
    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;