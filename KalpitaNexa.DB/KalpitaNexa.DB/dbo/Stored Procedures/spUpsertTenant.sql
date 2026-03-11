
CREATE PROCEDURE [dbo].[spUpsertTenant]
    @TenantId UNIQUEIDENTIFIER = NULL,
    @TenantName NVARCHAR(200),
    @ApplicationIds NVARCHAR(MAX),    
    @FeatureIds NVARCHAR(MAX),         
    @RequestingUserId UNIQUEIDENTIFIER

/*
    Object Name : dbo.spUpsertTenant
    Object Type : StoredProcedure
    Created Date: 2025-11-21
	created by: Vaishnavi Mohan
    Purpose     : Handles both Creation and Updating of Tenants (Upsert).
                  - If @TenantId is NULL or does not exist -> Create New Tenant.
                  - If @TenantId exists -> Update Existing Tenant details, Apps, and Features.
*/

AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @IsSuperAdmin BIT;
    DECLARE @RequestingUserEmail NVARCHAR(300);
    DECLARE @CurrentTenantId UNIQUEIDENTIFIER;
    DECLARE @IsUpdate BIT = 0;

    SELECT @IsSuperAdmin = IsSuperAdmin, @RequestingUserEmail = UserEmail
    FROM dbo.Users WHERE UserId = @RequestingUserId AND IsActive = 1;

    IF @IsSuperAdmin = 0 OR @IsSuperAdmin IS NULL
    BEGIN
        SELECT 'Permission denied. Only Super Admins can manage tenants.' AS Message, 0 AS Success;
        RETURN;
    END

    IF @ApplicationIds IS NOT NULL AND LEN(LTRIM(RTRIM(@ApplicationIds))) > 0
    BEGIN
        DECLARE @InputAppCount INT = (SELECT COUNT(*) FROM STRING_SPLIT(@ApplicationIds, ',') WHERE value <> '');
        
        DECLARE @ValidAppCount INT = (
            SELECT COUNT(*) 
            FROM [dbo].[Application] 
            WHERE AppId IN (SELECT CAST(value AS INT) FROM STRING_SPLIT(@ApplicationIds, ',') WHERE value <> '')
        );

        IF @InputAppCount <> @ValidAppCount
        BEGIN
            SELECT 'One or more provided application IDs are invalid.' AS Message, 0 AS Success;
            RETURN;
        END
    END

    IF @TenantId IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.Tenants WHERE TenantId = @TenantId)
    BEGIN
        SET @IsUpdate = 1;
        SET @CurrentTenantId = @TenantId;
    END
    ELSE
    BEGIN
        SET @IsUpdate = 0;
        SET @CurrentTenantId = ISNULL(@TenantId, NEWID());
    END

    BEGIN TRANSACTION;
    BEGIN TRY

        IF @IsUpdate = 1
        BEGIN
            
            -- A. Update Tenant Details
            UPDATE dbo.Tenants 
            SET TenantName = @TenantName, 
                ModifiedOn = SYSUTCDATETIME(), 
                ModifiedBy = @RequestingUserEmail
            WHERE TenantId = @CurrentTenantId;

            -- B. Sync Applications (MERGE)
            MERGE dbo.TenantApplication AS Target
            USING (
                SELECT CAST(value AS INT) as AppId 
                FROM STRING_SPLIT(@ApplicationIds, ',') 
                WHERE value <> ''
            ) AS Source
            ON (Target.TenantId = @CurrentTenantId AND Target.AppId = Source.AppId)
            
            WHEN NOT MATCHED BY TARGET THEN
                INSERT (TenantId, AppId, CreatedBy)
                VALUES (@CurrentTenantId, Source.AppId, @RequestingUserEmail)
            
            WHEN NOT MATCHED BY SOURCE AND Target.TenantId = @CurrentTenantId THEN
                DELETE;

            -- C. Sync Features (MERGE)
            MERGE dbo.TenantFeatureMapping AS Target
            USING (
                -- Source: Combine Tenant's Apps with the requested Feature IDs (Cross Logic as per original SP)
                SELECT ta.AppId, f.FeatureId
                FROM dbo.TenantApplication ta 
                CROSS JOIN [dbo].[Features] f 
                WHERE ta.TenantId = @CurrentTenantId
                AND f.FeatureId IN (SELECT CAST(value AS INT) FROM STRING_SPLIT(@FeatureIds, ',') WHERE value <> '')
            ) AS Source
            ON (Target.TenantId = @CurrentTenantId AND Target.AppId = Source.AppId AND Target.FeatureId = Source.FeatureId)

            WHEN NOT MATCHED BY TARGET THEN
                INSERT (TenantId, AppId, FeatureId, CreatedBy)
                VALUES (@CurrentTenantId, Source.AppId, Source.FeatureId, @RequestingUserEmail)

            WHEN NOT MATCHED BY SOURCE AND Target.TenantId = @CurrentTenantId THEN
                DELETE;

            COMMIT TRANSACTION;
            SELECT 'Tenant updated successfully.' AS Message, 1 AS Success, @CurrentTenantId AS TenantId;
        END
        ELSE
        BEGIN
            
            -- A. Create Tenant
            INSERT INTO dbo.Tenants (TenantId, TenantName, CreatedBy)
            VALUES (@CurrentTenantId, @TenantName, @RequestingUserEmail);

            -- B. Insert Applications
            IF @ApplicationIds IS NOT NULL AND LEN(LTRIM(RTRIM(@ApplicationIds))) > 0
            BEGIN
                INSERT INTO dbo.TenantApplication (TenantId, AppId, CreatedBy)
                SELECT 
                    @CurrentTenantId,
                    CAST(value AS INT), 
                    @RequestingUserEmail
                FROM 
                    STRING_SPLIT(@ApplicationIds, ',')
                WHERE value <> '';
            END

            -- C. Assign Creator Role (Only done on Creation)
            INSERT INTO dbo.UserRoles (TenantId, UserId, RoleId, CreatedBy)
            VALUES (@CurrentTenantId, @RequestingUserId, 1, @RequestingUserEmail);
            
            -- D. Insert Feature Mappings
            IF @FeatureIds IS NOT NULL AND LEN(LTRIM(RTRIM(@FeatureIds))) > 0
            BEGIN
                INSERT INTO dbo.TenantFeatureMapping (TenantId, AppId, FeatureId, CreatedBy)
                SELECT 
                    ta.TenantId,         
                    ta.AppId,             
                    f.FeatureId,         
                    @RequestingUserEmail
                FROM 
                    dbo.TenantApplication ta
                CROSS JOIN 
                    [dbo].[Features] f 
                WHERE 
                    ta.TenantId = @CurrentTenantId
                    AND f.FeatureId IN (SELECT CAST(value AS INT) FROM STRING_SPLIT(@FeatureIds, ',') WHERE value <> ''); 
            END

            COMMIT TRANSACTION;
            SELECT 'Tenant and application assignments created successfully.' AS Message, 1 AS Success, @CurrentTenantId AS TenantId;
        END

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;
        
        SELECT ERROR_MESSAGE() AS Message, 0 AS Success;
    END CATCH
END;