CREATE PROCEDURE [dbo].[spUpdateUserAndAssignments]
/*
	Object Name : dbo.spUpdateUserAndAssignments
	Object Type : StoredProcedure
	Alter Date: 15-10-2025
	Created By  : Archana Gudise
	Purpose     : Updates a user's details, their role, and sets default application, language, and model.

    Based on logic from spCreateUserAndAssignToTenant and previous version of this SP.
*/
(
    @ExecutingUserEmail NVARCHAR(300),
    @TenantId UNIQUEIDENTIFIER,
    @UserIdToUpdate UNIQUEIDENTIFIER,
    @NewUserName NVARCHAR(200),
    @NewUserEmail NVARCHAR(300),
    
    -- --- MODIFIED PARAMETERS TO ACCEPT IDs ---
    @NewAppId INT,                   -- Accepts App ID
    @RoleNames NVARCHAR(MAX),
    @NewLanguageId INT = NULL,       -- Accepts Language ID
    @NewModelId INT = NULL           -- Accepts [dbo].[Model] ID
)
AS
BEGIN
    SET NOCOUNT ON;
 
    -- Variable Declaration
    DECLARE @ExecutingUserId UNIQUEIDENTIFIER, @IsSuperAdmin BIT, @CanPerformAction BIT = 0;
    DECLARE @ResolvedRoleIds TABLE (ID INT);
    DECLARE @InputRoles TABLE (Name NVARCHAR(200));

    INSERT INTO @InputRoles (Name) SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@RoleNames, ',');
 
    -- 1. Permission Check (No changes)
    SELECT @ExecutingUserId = UserId, @IsSuperAdmin = IsSuperAdmin FROM dbo.Users WHERE UserEmail = @ExecutingUserEmail AND IsActive = 1;
    IF @ExecutingUserId IS NULL BEGIN RAISERROR('Executing user not found or is inactive.', 16, 1); RETURN; END
    IF @IsSuperAdmin = 1 OR EXISTS (SELECT 1 FROM dbo.UserRoles tu JOIN dbo.Roles r ON tu.RoleId = r.RoleId WHERE tu.UserId = @ExecutingUserId AND tu.TenantId = @TenantId AND r.RoleName = 'Admin' AND tu.IsActive = 1) 
    BEGIN SET @CanPerformAction = 1; END
    IF @CanPerformAction = 0 BEGIN RAISERROR('Permission denied.', 16, 1); RETURN; END
 
    -- 2. Validate Input using IDs (Much simpler now)
    IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE UserId = @UserIdToUpdate) BEGIN RAISERROR('The user you are trying to update does not exist.', 16, 1); RETURN; END
    IF EXISTS (SELECT 1 FROM dbo.Users WHERE UserEmail = @NewUserEmail AND UserId <> @UserIdToUpdate) BEGIN RAISERROR('The provided email is already in use.', 16, 1); RETURN; END
    IF NOT EXISTS (SELECT 1 FROM [dbo].[Applications] WHERE AppId = @NewAppId) BEGIN RAISERROR('The specified application was not found.', 16, 1); RETURN; END

    -- Resolve Role Names to RoleIds (using the provided AppId)
    INSERT INTO @ResolvedRoleIds (ID)
    SELECT r.RoleId FROM dbo.Roles r JOIN @InputRoles n ON r.RoleName = n.Name WHERE r.TenantId = @TenantId AND r.AppId = @NewAppId;
    IF (SELECT COUNT(*) FROM @InputRoles WHERE Name <> '') <> (SELECT COUNT(*) FROM @ResolvedRoleIds)
    BEGIN RAISERROR('One or more role names are invalid for the specified application.', 16, 1); RETURN; END
 
    -- 3. Transaction
    BEGIN TRANSACTION;
    BEGIN TRY
        -- Update user's details and default application ID
        UPDATE dbo.Users 
        SET 
            UserName = @NewUserName, 
            UserEmail = @NewUserEmail, 
            DefaultAppId = @NewAppId,
            ModifiedBy = @ExecutingUserEmail, 
            ModifiedOn = SYSDATETIME() 
        WHERE UserId = @UserIdToUpdate;

        -- Replace role assignments
        DELETE FROM dbo.UserRoles WHERE UserId = @UserIdToUpdate AND TenantId = @TenantId;
        INSERT INTO dbo.UserRoles (TenantId, UserId, RoleId, IsActive, CreatedOn, CreatedBy) 
        SELECT @TenantId, @UserIdToUpdate, ID, 1, SYSDATETIME(), @ExecutingUserEmail FROM @ResolvedRoleIds;
        
        -- Smartly INSERT or UPDATE the UserApplication record with new default IDs
        MERGE INTO dbo.UserApplication AS Target
        USING (SELECT @UserIdToUpdate AS UserId, @NewAppId AS AppId) AS Source
        ON (Target.UserId = Source.UserId AND Target.AppId = Source.AppId)
        WHEN MATCHED THEN
            -- If the record exists, update the defaults
            UPDATE SET 
                DefaultLanguageId = @NewLanguageId,
                DefaultModelId = @NewModelId
        WHEN NOT MATCHED BY TARGET THEN
            -- If the user-app assignment is new, create it with the defaults
            INSERT (UserId, AppId, CreatedBy, CreatedOn, DefaultLanguageId, DefaultModelId)
            VALUES (@UserIdToUpdate, @NewAppId, @ExecutingUserEmail, SYSDATETIME(), @NewLanguageId, @NewModelId);

        COMMIT TRANSACTION;
 
        SELECT 'User updated successfully' AS Message, @UserIdToUpdate AS UserId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END