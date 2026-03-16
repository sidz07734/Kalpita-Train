CREATE PROCEDURE [dbo].[spUpsertRoleWithFeatures]
/*
    Object Name  : dbo.spUpsertRoleWithFeatures
    Object Type  : Stored Procedure
    Created By   : Consolidated (Create + Update functionality)
    Purpose      : Creates or Updates a role for a Tenant + App and
                   synchronizes its associated features.
                   - If RoleId is NULL → CREATE
                   - If RoleId exists → UPDATE + Feature Sync
                   Feature Sync includes:
                     1. Insert new features
                     2. Reactivate existing inactive features
                     3. Deactivate removed features
*/
    @RoleId INT = NULL,          -- NULL = CREATE mode
    @RoleName NVARCHAR(200),
    @TenantId UNIQUEIDENTIFIER,
    @AppId INT,
    @UserId NVARCHAR(200),        -- Used as CreatedBy / ModifiedBy
    @FeatureIds NVARCHAR(MAX)     -- Comma-separated list of features
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @IsCreate BIT = CASE WHEN @RoleId IS NULL OR @RoleId = 0 THEN 1 ELSE 0 END;

        -----------------------------------------------------------
        -- STEP 1: CREATE MODE
        -----------------------------------------------------------
        IF @IsCreate = 1
        BEGIN
            -- Check for duplicates
            IF EXISTS (
                SELECT 1 FROM dbo.Roles
                WHERE RoleName = @RoleName
                  AND TenantId = @TenantId
                  AND AppId = @AppId
                  AND IsActive = 1
            )
            BEGIN
                -- Return existing role if already present
                SELECT RoleId, RoleName, IsActive, TenantId, AppId, CreatedOn, CreatedBy
                FROM dbo.Roles
                WHERE RoleName = @RoleName
                  AND TenantId = @TenantId
                  AND AppId = @AppId
                  AND IsActive = 1;

                COMMIT TRANSACTION;
                RETURN;
            END

            -- Insert new role
            INSERT INTO dbo.Roles (RoleName, IsActive, TenantId, AppId, CreatedBy)
            VALUES (@RoleName, 1, @TenantId, @AppId, @UserId);

            SET @RoleId = SCOPE_IDENTITY();
        END
        -----------------------------------------------------------
        -- STEP 2: UPDATE MODE (Role Already Exists)
        -----------------------------------------------------------
        ELSE
        BEGIN
            UPDATE dbo.Roles
            SET RoleName   = @RoleName,
                ModifiedOn = SYSUTCDATETIME(),
                ModifiedBy = @UserId
            WHERE RoleId = @RoleId
              AND TenantId = @TenantId
              AND AppId = @AppId
              AND IsActive = 1;
        END

        -----------------------------------------------------------
        -- STEP 3: Parse FeatureIds into table variable
        -----------------------------------------------------------
        DECLARE @FeatureTable TABLE (FeatureId INT PRIMARY KEY);

        IF @FeatureIds IS NOT NULL AND LEN(@FeatureIds) > 0
        BEGIN
            INSERT INTO @FeatureTable (FeatureId)
            SELECT DISTINCT TRY_CAST([value] AS INT)
            FROM STRING_SPLIT(@FeatureIds, ',')
            WHERE TRY_CAST([value] AS INT) IS NOT NULL;
        END

        -----------------------------------------------------------
        -- STEP 4: DEACTIVATE removed features
        -----------------------------------------------------------
        UPDATE rf
        SET IsActive = 0,
            ModifiedOn = SYSUTCDATETIME(),
            ModifiedBy = @UserId
        FROM dbo.RoleFeatures rf
        LEFT JOIN @FeatureTable ft ON rf.FeatureId = ft.FeatureId
        WHERE rf.RoleId = @RoleId
          AND rf.AppId = @AppId
          AND rf.IsActive = 1
          AND ft.FeatureId IS NULL;

        -----------------------------------------------------------
        -- STEP 5: INSERT NEW + REACTIVATE previously inactive
        -----------------------------------------------------------
        MERGE dbo.RoleFeatures AS Target
        USING (
            SELECT FeatureId FROM @FeatureTable
        ) AS Source
        ON Target.RoleId = @RoleId
           AND Target.FeatureId = Source.FeatureId
           AND Target.AppId = @AppId
        WHEN MATCHED THEN
            UPDATE SET IsActive = 1,
                       ModifiedOn = SYSUTCDATETIME(),
                       ModifiedBy = @UserId
        WHEN NOT MATCHED THEN
            INSERT (RoleId, FeatureId, IsActive, AppId, CreatedOn, CreatedBy)
            VALUES (@RoleId, Source.FeatureId, 1, @AppId, SYSUTCDATETIME(), @UserId);

        -----------------------------------------------------------
        -- STEP 6: Return Final Role + Active Features
        -----------------------------------------------------------
        SELECT 
            r.RoleId,
            r.RoleName,
            r.TenantId,
            r.AppId,
            f.FeatureId,
            f.FeatureName
        FROM dbo.Roles r
        LEFT JOIN dbo.RoleFeatures rf
            ON r.RoleId = rf.RoleId AND rf.IsActive = 1 AND rf.AppId = @AppId
        LEFT JOIN dbo.Features f
            ON rf.FeatureId = f.FeatureId AND f.IsActive = 1
        WHERE r.RoleId = @RoleId;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END