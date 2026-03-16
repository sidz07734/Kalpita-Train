
CREATE   PROCEDURE [dbo].[spSoftDeleteRoleById]
/*
    Object Name : dbo.spSoftDeleteRoleById
    Object Type : StoredProcedure
    Created Date: 18-09-2025
    Modified Date: 05-10-2025
    Created By  : Vyshnavi Atthuluri
    Purpose     : Soft delete a role under a specific tenant and app.
*/
    @RoleId INT,
    @TenantId UNIQUEIDENTIFIER,
    @AppId INT
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- Step 1: Soft delete role
        UPDATE dbo.Roles
        SET 
            IsActive = 0,
            ModifiedOn = SYSUTCDATETIME()
        WHERE RoleId = @RoleId
          AND TenantId = @TenantId
          AND AppId = @AppId
          AND IsActive = 1;  -- ✅ Only if currently active

        -- Step 2: Soft delete corresponding role-feature mappings
        UPDATE dbo.RoleFeatures
        SET 
            IsActive = 0,
            ModifiedOn = SYSUTCDATETIME()
        WHERE RoleId = @RoleId
          AND AppId = @AppId
          AND IsActive = 1;  -- ✅ Only active ones

        COMMIT TRANSACTION;

        -- Step 3: Return confirmation for backend
        SELECT 
            @RoleId AS DeletedRoleId,
            @TenantId AS TenantId,
            @AppId AS AppId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END