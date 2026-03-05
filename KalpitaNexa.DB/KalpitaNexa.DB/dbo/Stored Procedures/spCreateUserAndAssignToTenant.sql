




CREATE PROCEDURE [dbo].[spCreateUserAndAssignToTenant]
/*
	Object Name : dbo.spCreateUserAndAssignToTenant
	Object Type : StoredProcedure
	Created By  : Archana Gudise
	Purpose     : Creates a new user or reactivates an inactive one, then assigns them to a specific application and roles within a tenant.
	Modified On : 04-11-2025
	Modification: Updated to fetch initial credits from [dbo].[ApplicationSettings] and set the LastCreditRefreshDate for the user's credit cycle.
*/
(
    @ExecutingUserEmail NVARCHAR(300),
    @TenantId UNIQUEIDENTIFIER,
    @NewUserName NVARCHAR(200),
    @NewUserEmail NVARCHAR(300),
    @AppName NVARCHAR(200),
    @RoleNames NVARCHAR(MAX),
    @AllowReactivation BIT -- Parameter to control the reactivation workflow
)
AS
BEGIN
    SET NOCOUNT ON;
    
    -- Safeguard Check
    IF @RoleNames IS NULL OR LTRIM(RTRIM(@RoleNames)) = ''
    BEGIN
        RAISERROR('At least one role must be provided for the new user.', 16, 1);
        RETURN;
    END

    -- Variable Declaration
    DECLARE @ExecutingUserId UNIQUEIDENTIFIER, @IsSuperAdmin BIT, @CanPerformAction BIT = 0;
    DECLARE @NewUserId UNIQUEIDENTIFIER;
    DECLARE @TemporaryPassword NVARCHAR(50), @PasswordForStorage NVARCHAR(500);
    DECLARE @AppId INT;
    DECLARE @ResolvedRoleIds TABLE (ID INT);
    DECLARE @InputRoles TABLE (RoleName NVARCHAR(200));
    -- *** MODIFICATION START ***
    -- Added variables to hold settings from the [dbo].[ApplicationSettings] table
    DECLARE @InitialMonthlyCredits INT;
    DECLARE @TokensPerCredit INT;
    -- *** MODIFICATION END ***

    INSERT INTO @InputRoles (RoleName)
    SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@RoleNames, ',') WHERE LTRIM(RTRIM(value)) <> '';
    
    IF NOT EXISTS (SELECT 1 FROM @InputRoles)
    BEGIN
        RAISERROR('At least one valid role must be provided for the new user.', 16, 1);
        RETURN;
    END
    
    -- 1. Permission Check (Unchanged)
    SELECT @ExecutingUserId = UserId, @IsSuperAdmin = IsSuperAdmin
    FROM dbo.Users WHERE UserEmail = @ExecutingUserEmail AND IsActive = 1;

    IF @ExecutingUserId IS NULL BEGIN RAISERROR('Executing user not found or is inactive.', 16, 1); RETURN; END
    
    IF @IsSuperAdmin = 1 OR EXISTS (
        SELECT 1 FROM dbo.UserRoles tu 
        JOIN dbo.Roles r ON tu.RoleId = r.RoleId
        WHERE tu.UserId = @ExecutingUserId AND tu.TenantId = @TenantId AND r.RoleName = 'Admin' AND tu.IsActive = 1
    ) BEGIN SET @CanPerformAction = 1; END
    
    IF @CanPerformAction = 0 BEGIN RAISERROR('Permission denied. User is not authorized to create users for this tenant.', 16, 1); RETURN; END
    
    -- *** MODIFICATION START ***
    -- 2. Resolve Application Name to AppId and get ApplicationSettings
    SELECT 
        @AppId = a.AppId,
        @InitialMonthlyCredits = s.MonthlyCredits,
        @TokensPerCredit = s.TokensPerCredit
    FROM [dbo].[Application] a
    JOIN [dbo].[ApplicationSettings] s ON a.AppId = s.AppId
    WHERE a.ApplicationName = @AppName AND s.IsActive = 1;

    IF @AppId IS NULL 
    BEGIN 
        RAISERROR('The specified application was not found or has no active settings.', 16, 1); 
        RETURN; 
    END
    -- *** MODIFICATION END ***

    -- 3. Resolve Role Names to RoleIds for the specific App (Unchanged)
    INSERT INTO @ResolvedRoleIds (ID)
    SELECT r.RoleId 
    FROM dbo.Roles r
    INNER JOIN @InputRoles ir ON r.RoleName = ir.RoleName
    WHERE r.TenantId = @TenantId AND r.AppId = @AppId AND r.IsActive = 1;

    -- 4. Validate that all role names were found for that specific App (Unchanged)
    IF (SELECT COUNT(*) FROM @InputRoles) <> (SELECT COUNT(*) FROM @ResolvedRoleIds)
    BEGIN 
        DECLARE @InvalidRoles NVARCHAR(MAX);
        DECLARE @ErrorMessage NVARCHAR(500);

        SELECT @InvalidRoles = STRING_AGG(ir.RoleName, ', ')
        FROM @InputRoles ir
        LEFT JOIN dbo.Roles r ON ir.RoleName = r.RoleName AND r.TenantId = @TenantId AND r.AppId = @AppId AND r.IsActive = 1
        WHERE r.RoleId IS NULL;
        
        SET @ErrorMessage = FORMATMESSAGE('One or more role names are invalid or do not belong to this tenant for the application "%s". Invalid role(s): %s', @AppName, @InvalidRoles);
        RAISERROR(@ErrorMessage, 16, 1); 
        RETURN; 
    END

    -- 5. Check user existence and status (Unchanged)
    DECLARE @ExistingUserId UNIQUEIDENTIFIER, @IsExistingUserActive BIT;
    SELECT @ExistingUserId = UserId, @IsExistingUserActive = IsActive 
    FROM dbo.Users 
    WHERE UserEmail = @NewUserEmail;

    -- Handle Inactive User Found (Unchanged)
    IF @ExistingUserId IS NOT NULL AND @IsExistingUserActive = 0
    BEGIN
        IF @AllowReactivation = 0
        BEGIN
            SELECT 'USER_INACTIVE' AS Status, 'This user already exists but is inactive. Do you want to reactivate them and assign them to this application?' AS Message, @ExistingUserId AS UserId;
            RETURN;
        END
        SET @NewUserId = @ExistingUserId;
    END
    -- Handle Active User Found (Unchanged)
    ELSE IF @ExistingUserId IS NOT NULL AND @IsExistingUserActive = 1
    BEGIN
        IF EXISTS (SELECT 1 FROM dbo.UserApplication WHERE UserId = @ExistingUserId AND AppId = @AppId)
        BEGIN
            RAISERROR('This email address is already registered and active for the selected application.', 16, 1);
            RETURN;
        END
        SET @NewUserId = @ExistingUserId;
    END
    -- Handle New User (Unchanged)
    ELSE
    BEGIN
        SET @NewUserId = NEWID();
    END

    -- 6. Generate Temporary Password (only for brand new users) (Unchanged)
    IF @ExistingUserId IS NULL
    BEGIN
        DECLARE @UpperPart NVARCHAR(2) = UPPER(LEFT(REPLACE(@NewUserName, ' ', ''), 2));
        DECLARE @LowerPart NVARCHAR(2) = LOWER(SUBSTRING(REPLACE(@NewUserName, ' ', ''), 3, 2));
        DECLARE @NumberPart NVARCHAR(4) = FORMAT(ABS(CHECKSUM(NEWID())) % 9000 + 1000, '0000');
        DECLARE @SpecialPart NVARCHAR(1) = '@';

        -- Final password structure: AaBb@1234
        SET @TemporaryPassword = @UpperPart + @LowerPart + @SpecialPart + @NumberPart;
        SET @PasswordForStorage = @TemporaryPassword;

    END
    
    -- 7. Use Transaction
    BEGIN TRANSACTION;
    BEGIN TRY
        -- User Creation/Reactivation Logic (Unchanged)
        IF @ExistingUserId IS NULL
        BEGIN
            INSERT INTO dbo.Users (UserId, UserName, UserEmail, PasswordHash, IsSuperAdmin, IsActive, CreatedOn, CreatedBy)
            VALUES (@NewUserId, @NewUserName, @NewUserEmail, @PasswordForStorage, 0, 1, SYSDATETIME(), @ExecutingUserEmail);
        END
        ELSE IF @IsExistingUserActive = 0 AND @AllowReactivation = 1
        BEGIN
            UPDATE dbo.Users
            SET IsActive = 1, UserName = @NewUserName, ModifiedOn = SYSDATETIME(), ModifiedBy = @ExecutingUserEmail
            WHERE UserId = @NewUserId;
        END
        
        -- Assign roles (Unchanged)
        INSERT INTO dbo.UserRoles (TenantId, UserId, RoleId, IsActive, CreatedOn, CreatedBy)
        SELECT @TenantId, @NewUserId, ID, 1, SYSDATETIME(), @ExecutingUserEmail 
        FROM @ResolvedRoleIds;

        -- *** MODIFICATION START ***
        -- Assign to application with correct initial credits and cycle start date
        -- This check prevents errors if the user (e.g. a reactivated user) is already in the table
        IF NOT EXISTS (SELECT 1 FROM dbo.UserApplication WHERE UserId = @NewUserId AND AppId = @AppId)
        BEGIN
            INSERT INTO dbo.UserApplication
            (
                UserId, 
                AppId, 
                CreatedOn, 
                CreatedBy, 
                RemainingCredits, 
                TokensPerCredit,
                ConsumedInputTokens, 
                ConsumedOutputTokens,
                LastCreditRefreshDate -- Set the start of the first cycle
            )
            VALUES
            (
                @NewUserId, 
                @AppId, 
                SYSDATETIME(), 
                @ExecutingUserEmail,
                @InitialMonthlyCredits, -- Use value from Applicationettings
                @TokensPerCredit,      -- Use value from Applicationettings
                0, 
                0,
                SYSDATETIME() -- The first cycle starts now
            );
        END;
        -- *** MODIFICATION END ***
        
        COMMIT TRANSACTION;
        
        -- 8. Return final success result (Unchanged)
        SELECT
            'User processed and assigned successfully.' AS Message,
            @NewUserId AS UserId,
            @TemporaryPassword AS TemporaryPassword;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;