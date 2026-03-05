CREATE PROCEDURE[dbo].[spDeleteTenantAdmin]
/*
	Object Name : dbo.spDeleteTenantAdmin
	Object Type : StoredProcedure
	Created Date: 18-09-2025
	Created By  : Kalpataru sahoo
	Purpose     : Soft delete a tenant admin
*/
    @UserId UNIQUEIDENTIFIER,
    @TenantId UNIQUEIDENTIFIER,
    @ModifiedBy NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    
    BEGIN TRANSACTION;
    BEGIN TRY
        -- Soft delete from UserRoles
        UPDATE dbo.UserRoles 
        SET IsActive = 0,
            ModifiedOn = SYSUTCDATETIME(),
            ModifiedBy = @ModifiedBy
        WHERE UserId = @UserId AND TenantId = @TenantId;
        
        -- Soft delete tenant features (using TenantFeatures table)
        UPDATE TenantFeatures 
        SET IsActive = 0,
            ModifiedOn = SYSUTCDATETIME(),
            ModifiedBy = @ModifiedBy
        WHERE UserId = @UserId;
        
        -- Check if user belongs to other tenants
        IF NOT EXISTS (SELECT 1 FROM dbo.UserRoles WHERE UserId = @UserId AND IsActive = 1)
        BEGIN
            -- If no other tenant associations, soft delete from Users
            UPDATE dbo.Users 
            SET IsActive = 0,
                ModifiedOn = SYSUTCDATETIME(),
                ModifiedBy = @ModifiedBy
            WHERE UserId = @UserId;
        END
        
        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END