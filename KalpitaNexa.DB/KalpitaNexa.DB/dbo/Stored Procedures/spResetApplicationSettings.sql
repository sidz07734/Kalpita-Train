
CREATE PROCEDURE dbo.[spResetApplicationSettings]
/*
    Object Name : dbo.spSetApplicationSettings
    Object Type : StoredProcedure
    Created Date: 23-09-2025
    Created By  : Kalpataru Sahoo
    Purpose     : Replaces all language, model, and data-source mappings
                  for a given application with the provided lists.
*/
    @AppId INT,
    @LanguageIds NVARCHAR(MAX) = NULL,
    @ModelIds NVARCHAR(MAX) = NULL,
    @DataSourceIds NVARCHAR(MAX) = NULL,
    @CreatedBy NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        BEGIN TRAN

		-- Remove existing mappings for this app (we'll re-insert)
        DELETE FROM [dbo].[ApplicationLanguages] WHERE AppId = @AppId;
        DELETE FROM [dbo].[ApplicationModels] WHERE AppId = @AppId;
        DELETE FROM [dbo].[ApplicationDataSources] WHERE AppId = @AppId;


        -- Insert languages if provided
        IF @LanguageIds IS NOT NULL AND LEN(LTRIM(RTRIM(@LanguageIds))) > 0
        BEGIN
            INSERT INTO [dbo].[ApplicationLanguages] (AppId, LanguageId, CreatedBy)
            SELECT @AppId, TRY_CAST(value AS INT), @CreatedBy
            FROM STRING_SPLIT(@LanguageIds, ',')
            WHERE TRY_CAST(value AS INT) IS NOT NULL;
        END

        -- Insert models if provided
        IF @ModelIds IS NOT NULL AND LEN(LTRIM(RTRIM(@ModelIds))) > 0
        BEGIN
            INSERT INTO [dbo].[ApplicationModels] (AppId, ModuleID, CreatedBy)
            SELECT @AppId, TRY_CAST(value AS INT), @CreatedBy
            FROM STRING_SPLIT(@ModelIds, ',')
            WHERE TRY_CAST(value AS INT) IS NOT NULL;
        END

        -- Insert data sources if provided
        IF @DataSourceIds IS NOT NULL AND LEN(LTRIM(RTRIM(@DataSourceIds))) > 0
        BEGIN
            INSERT INTO [dbo].[ApplicationDataSources] (AppId, DataSourceId, CreatedBy)
            SELECT @AppId, TRY_CAST(value AS INT), @CreatedBy
            FROM STRING_SPLIT(@DataSourceIds, ',')
            WHERE TRY_CAST(value AS INT) IS NOT NULL;
        END

        COMMIT TRAN;
        SELECT 1 AS Success, 'Settings saved' AS Message;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK TRAN;
        DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
        RAISERROR('spSetApplicationSettings failed: %s', 16, 1, @ErrorMessage);
    END CATCH
END