
CREATE   PROCEDURE [dbo].[spUpsertTenantFeatures]
/*
    Object Name : dbo.spUpsertTenantFeatures
    Object Type : StoredProcedure
    Created Date: 18-09-2025
    Modified Date: 21-11-2025
	Modified By: Vaishnavi Mohan
    Purpose     : Synchronizes dbo.Features for a tenant (Upsert logic).
                  1. Reactivates features in the list.
                  2. Inserts new features in the list.
                  3. Deactivates features NOT in the list.
*/
    @TenantId UNIQUEIDENTIFIER,
    @FeatureIds NVARCHAR(MAX), -- Comma-separated feature IDs
    @CreatedBy NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    
    BEGIN TRANSACTION;
    BEGIN TRY
        -- 1. Check if tenant exists
        IF NOT EXISTS (SELECT 1 FROM dbo.Tenants WHERE TenantId = @TenantId AND IsActive = 1)
        BEGIN
            RAISERROR('Tenant not found or inactive', 16, 1);
            RETURN;
        END

        -- 2. Perform the UPSERT (Merge)
        -- This replaces the slow Cursor logic with a set-based operation
        MERGE dbo.TenantFeatureMapping AS Target
        USING (
            -- Parse the input string and validate against the main Features table
            SELECT DISTINCT CAST(s.value AS INT) AS FeatureId
            FROM STRING_SPLIT(@FeatureIds, ',') s
            JOIN dbo.Features f ON f.FeatureId = CAST(s.value AS INT)
            WHERE f.IsActive = 1
        ) AS Source
        ON (Target.TenantId = @TenantId AND Target.FeatureId = Source.FeatureId)

        -- A. MATCHED: The feature is already mapped. Ensure it is Active.
        WHEN MATCHED THEN
            UPDATE SET 
                IsActive = 1,
                ModifiedOn = SYSUTCDATETIME(),
                ModifiedBy = @CreatedBy

        -- B. NOT MATCHED BY TARGET: The feature is in the list but not in the mapping table. Insert it.
        WHEN NOT MATCHED BY TARGET THEN
            INSERT (TenantId, FeatureId, IsActive, CreatedOn, CreatedBy)
            VALUES (@TenantId, Source.FeatureId, 1, SYSUTCDATETIME(), @CreatedBy)

        -- C. NOT MATCHED BY SOURCE: The feature is in the mapping table but NOT in the input list. Deactivate it.
        WHEN NOT MATCHED BY SOURCE AND Target.TenantId = @TenantId THEN
            UPDATE SET 
                IsActive = 0,
                ModifiedOn = SYSUTCDATETIME(),
                ModifiedBy = @CreatedBy;

        COMMIT TRANSACTION;
        
        -- Optional: Return success status
        SELECT 'Tenant features synchronized successfully.' AS Message, 1 AS Success;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;
        
        -- Throw allows the original error (constraint violation, etc.) to bubble up
        THROW;
    END CATCH
END