


CREATE PROCEDURE [dbo].[spUpdateApplicationSettings]
/*
    Object Name : dbo.spUpdateApplicationSettings
	Object Type : StoredProcedure
    Purpose     : Intelligently INSERTS, UPDATES, or DEACTIVATES settings for an application.
*/
    @AppId INT,
    @LanguageIds NVARCHAR(MAX) = NULL,
    @ModelIds NVARCHAR(MAX) = NULL,
    @DataSourceIds NVARCHAR(MAX) = NULL,
    @ModifiedBy NVARCHAR(200),
    @MonthlyCredits INT = NULL,      -- <<< CHANGED from @FreeCredits
    @TokensPerCredit INT = NULL,
    @ChatHistoryInDays INT = NULL,
    @ConfidentialScore DECIMAL(3, 2) = NULL 
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        BEGIN TRAN;

        -- Create temporary tables to hold the IDs from the API call
        DECLARE @LangTable TABLE (ID INT PRIMARY KEY);
        IF @LanguageIds IS NOT NULL INSERT INTO @LangTable SELECT value FROM STRING_SPLIT(@LanguageIds, ',');

        DECLARE @ModelTable TABLE (ID INT PRIMARY KEY);
        IF @ModelIds IS NOT NULL INSERT INTO @ModelTable SELECT value FROM STRING_SPLIT(@ModelIds, ',');
        
        DECLARE @DataSourceTable TABLE (ID INT PRIMARY KEY);
        IF @DataSourceIds IS NOT NULL INSERT INTO @DataSourceTable SELECT value FROM STRING_SPLIT(@DataSourceIds, ',');

        -- === Process Languages using MERGE ===
        MERGE [dbo].[ApplicationLanguages] AS Target
        USING @LangTable AS Source
        ON Target.AppId = @AppId AND Target.LanguageId = Source.ID
        WHEN MATCHED THEN
            UPDATE SET IsActive = 1, ModifiedBy = @ModifiedBy, ModifiedOn = SYSUTCDATETIME()
        WHEN NOT MATCHED BY TARGET THEN
            INSERT (AppId, LanguageId, CreatedBy) VALUES (@AppId, Source.ID, @ModifiedBy)
        WHEN NOT MATCHED BY SOURCE AND Target.AppId = @AppId THEN
            UPDATE SET IsActive = 0, ModifiedBy = @ModifiedBy, ModifiedOn = SYSUTCDATETIME();
        
        -- === Process Models using MERGE ===
        MERGE [dbo].[ApplicationModels] AS Target
        USING @ModelTable AS Source
        ON Target.AppId = @AppId AND Target.ModuleID = Source.ID
        WHEN MATCHED THEN
            UPDATE SET IsActive = 1, ModifiedBy = @ModifiedBy, ModifiedOn = SYSUTCDATETIME()
        WHEN NOT MATCHED BY TARGET THEN
            INSERT (AppId, ModuleID, CreatedBy) VALUES (@AppId, Source.ID, @ModifiedBy)
        WHEN NOT MATCHED BY SOURCE AND Target.AppId = @AppId THEN
            UPDATE SET IsActive = 0, ModifiedBy = @ModifiedBy, ModifiedOn = SYSUTCDATETIME();

        -- === Process Data Sources using MERGE ===
        MERGE [dbo].[ApplicationDataSources] AS Target
        USING @DataSourceTable AS Source
        ON Target.AppId = @AppId AND Target.DataSourceId = Source.ID
        WHEN MATCHED THEN
            UPDATE SET IsActive = 1, ModifiedBy = @ModifiedBy, ModifiedOn = SYSUTCDATETIME()
        WHEN NOT MATCHED BY TARGET THEN
            INSERT (AppId, DataSourceId, CreatedBy) VALUES (@AppId, Source.ID, @ModifiedBy)
        WHEN NOT MATCHED BY SOURCE AND Target.AppId = @AppId THEN
            UPDATE SET IsActive = 0, ModifiedBy = @ModifiedBy, ModifiedOn = SYSUTCDATETIME();

        -- === UPDATE [dbo].[ApplicationSettings] TABLE ===
        -- Only run this if at least one of the general settings parameters has been provided.
        IF @MonthlyCredits IS NOT NULL OR @TokensPerCredit IS NOT NULL OR @ChatHistoryInDays IS NOT NULL OR @ConfidentialScore IS NOT NULL -- <<< CHANGED from @FreeCredits
        BEGIN
            UPDATE [dbo].[ApplicationSettings]
            SET
                -- Use ISNULL to only update the column if a non-NULL value was passed.
                MonthlyCredits = ISNULL(@MonthlyCredits, MonthlyCredits), -- <<< CHANGED from FreeCredits
                TokensPerCredit = ISNULL(@TokensPerCredit, TokensPerCredit),
                ChatHistoryInDays = ISNULL(@ChatHistoryInDays, ChatHistoryInDays),
                ConfidentialScore = ISNULL(@ConfidentialScore, ConfidentialScore),
                ModifiedBy = @ModifiedBy,
                ModifiedOn = SYSUTCDATETIME()
            WHERE
                AppId = @AppId;
        END

        COMMIT TRAN;
        SELECT 1 AS Success, 'Settings updated successfully.' AS Message;

    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK TRAN;
        DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
        RAISERROR('spUpdateApplicationSettings failed: %s', 16, 1, @ErrorMessage);
    END CATCH
END