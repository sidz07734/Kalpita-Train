 
CREATE   PROCEDURE [dbo].[spUpsertUsers]

/*

    Object Name : dbo.spUpsertUsers

    Object Type : StoredProcedure

    Created Date: 21-11-2025

    Purpose     : Unified procedure to Create or Update a Tenant Admin/User.

                  - Upserts User details (Name, Email, Role).

                  - Syncs Tenant Feature Mappings (The provided list becomes the master list).

*/

    @UserId UNIQUEIDENTIFIER = NULL OUTPUT, -- NULL for Create, Valid ID for Update

    @UserName NVARCHAR(200),

    @UserEmail NVARCHAR(300),

    @PasswordHash NVARCHAR(500) = NULL,     -- Required for Create, Optional for Update

    @TenantId UNIQUEIDENTIFIER,

    @RoleId INT,

    @FeatureIds NVARCHAR(MAX),              -- Comma-separated feature IDs

    @RequestingUser NVARCHAR(200),          -- Replaces CreatedBy/ModifiedBy

    @GeneratedPassword NVARCHAR(50) = NULL OUTPUT -- Only populated on Create if logic requires

AS

BEGIN

    SET NOCOUNT ON;

    DECLARE @IsUpdate BIT = 0;

    -- 1. Determine Operation Mode

    IF @UserId IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.Users WHERE UserId = @UserId)

    BEGIN

        SET @IsUpdate = 1;

    END

    ELSE

    BEGIN

        SET @IsUpdate = 0;

        SET @UserId = ISNULL(@UserId, NEWID()); -- Generate ID for new user

    END
 
    BEGIN TRANSACTION;

    BEGIN TRY

        -- =================================================================================

        -- 2. VALIDATION

        -- =================================================================================

        -- Role Validation

        IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE RoleId = @RoleId AND IsActive = 1)

        BEGIN

            RAISERROR('Role ID does not exist or is inactive', 16, 1);

            RETURN;

        END
 
        -- Email Validation

        IF @IsUpdate = 1

        BEGIN

            -- Update: Check if email matches another user

            IF EXISTS (SELECT 1 FROM dbo.Users WHERE UserEmail = @UserEmail AND UserId != @UserId)

                RAISERROR('Email already exists for another user', 16, 1);

            -- Tenant/User Link Validation

            IF NOT EXISTS (SELECT 1 FROM dbo.UserRoles WHERE UserId = @UserId AND TenantId = @TenantId)

                RAISERROR('User does not exist for the specified tenant.', 16, 1);

        END

        ELSE

        BEGIN

            -- Create: Check if email matches any user

            IF EXISTS (SELECT 1 FROM dbo.Users WHERE UserEmail = @UserEmail)

                RAISERROR('Email already exists', 16, 1);

            -- Password Requirement for Create

            IF @PasswordHash IS NULL OR LEN(@PasswordHash) = 0

                RAISERROR('PasswordHash is required when creating a new user.', 16, 1);

        END
 
        -- =================================================================================

        -- 3. UPSERT USER & ROLE

        -- =================================================================================

        IF @IsUpdate = 1

        BEGIN

            -- A. Update User

            UPDATE dbo.Users 

            SET UserName = @UserName,

                UserEmail = @UserEmail,

                -- Only update password if a new one is provided

                PasswordHash = ISNULL(@PasswordHash, PasswordHash), 

                ModifiedOn = SYSUTCDATETIME(),

                ModifiedBy = @RequestingUser

            WHERE UserId = @UserId;
 
            -- B. Update Role

            UPDATE dbo.UserRoles 

            SET RoleId = @RoleId,

                ModifiedOn = SYSUTCDATETIME(),

                ModifiedBy = @RequestingUser

            WHERE UserId = @UserId AND TenantId = @TenantId;

        END

        ELSE

        BEGIN

            -- A. Insert User

            INSERT INTO dbo.Users (UserId, UserName, UserEmail, PasswordHash, IsSuperAdmin, IsActive, CreatedOn, CreatedBy)

            VALUES (@UserId, @UserName, @UserEmail, @PasswordHash, 0, 1, SYSUTCDATETIME(), @RequestingUser);
 
            -- B. Insert Role

            INSERT INTO dbo.UserRoles (TenantId, UserId, RoleId, IsActive, CreatedOn, CreatedBy)

            VALUES (@TenantId, @UserId, @RoleId, 1, SYSUTCDATETIME(), @RequestingUser);

        END
 
        -- =================================================================================

        -- 4. SYNCHRONIZE TENANT FEATURES (Merge Logic)

        -- =================================================================================

        -- This ensures the features in @FeatureIds are Active, and those missing are Inactive.

        MERGE dbo.TenantFeatureMapping AS Target

        USING (

            SELECT DISTINCT CAST(value AS INT) AS FeatureId

            FROM STRING_SPLIT(@FeatureIds, ',')

            WHERE LTRIM(RTRIM(value)) <> ''

        ) AS Source

        ON (Target.TenantId = @TenantId AND Target.FeatureId = Source.FeatureId)
 
        -- If Feature exists in input list -> Ensure it is Active

        WHEN MATCHED THEN

            UPDATE SET 

                IsActive = 1,

                ModifiedOn = SYSUTCDATETIME(),

                ModifiedBy = @RequestingUser
 
        -- If Feature is new in input list -> Insert it

        WHEN NOT MATCHED BY TARGET THEN

            INSERT (TenantId, FeatureId, IsActive, CreatedOn, CreatedBy)

            VALUES (@TenantId, Source.FeatureId, 1, SYSUTCDATETIME(), @RequestingUser)
 
        -- If Feature is currently in DB but NOT in input list -> Soft Delete (Deactivate)

        WHEN NOT MATCHED BY SOURCE AND Target.TenantId = @TenantId THEN

            UPDATE SET 

                IsActive = 0,

                ModifiedOn = SYSUTCDATETIME(),

                ModifiedBy = @RequestingUser;
 
        -- =================================================================================

        -- 5. FINAL COMMIT & RETURN

        -- =================================================================================

        COMMIT TRANSACTION;

        -- Return a standard success response

        SELECT 

            @UserId AS UserId, 

            CASE WHEN @IsUpdate = 1 THEN 'User and features updated successfully.' ELSE 'User and features created successfully.' END AS Message, 

            1 AS Success;
 
    END TRY

    BEGIN CATCH

        IF @@TRANCOUNT > 0

            ROLLBACK TRANSACTION;

        -- Return standard error format (or use THROW if your API prefers exception handling)

        SELECT ERROR_MESSAGE() AS Message, 0 AS Success;

    END CATCH

END