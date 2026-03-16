
/*
    Object Name : dbo.spSetDefaultUserSettings
    Object Type : StoredProcedure
    Modified Date: 2025-11-12 11:20:35
    Modified By  : Vaishnavi Mohan
    Purpose     : Sets or updates a user's default application preferences, including language, data source, 
                  and theme mode. 
*/


CREATE PROCEDURE [dbo].[spUpdateDefaultUserSettings]
    @UserID UNIQUEIDENTIFIER,
    @LanguageName NVARCHAR(255),
    @ApplicationName NVARCHAR(200),
    @DataSourceName NVARCHAR(200),
    @IsDarkMode BIT,
    @CurrentUser NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        DECLARE @FoundLanguageID INT;
        DECLARE @FoundAppClientID NVARCHAR(100);
        DECLARE @FoundDataSourceID INT;

        SELECT @FoundLanguageID = l.LanguageID FROM dbo.Languages AS l WHERE l.LanguageName = @LanguageName;
        SELECT @FoundAppClientID = a.ClientId FROM [dbo].[Applications] AS a WHERE a.ApplicationName = @ApplicationName AND a.IsActive = 1;
        SELECT @FoundDataSourceID = d.DataSourceId FROM dbo.DataSources AS d WHERE d.DataSourceName = @DataSourceName AND d.IsActive = 1;

        IF @FoundLanguageID IS NULL BEGIN RAISERROR('Invalid LanguageName: "%s" does not exist.', 16, 1, @LanguageName); RETURN; END
        IF @FoundAppClientID IS NULL BEGIN RAISERROR('Invalid ApplicationName: "%s" does not exist or is inactive.', 16, 1, @ApplicationName); RETURN; END
        IF @FoundDataSourceID IS NULL BEGIN RAISERROR('Invalid DataSourceName: "%s" does not exist or is inactive.', 16, 1, @DataSourceName); RETURN; END

        MERGE INTO dbo.UserSettings AS Target
        USING (SELECT @UserID AS UserID) AS Source ON (Target.UserID = Source.UserID)
        -- *** UPDATE LOGIC MODIFIED: ModuleID is removed ***
        WHEN MATCHED THEN
            UPDATE SET 
                Target.DEFAULTLANGUAGEID = @FoundLanguageID, 
                Target.AppID = @FoundAppClientID, 
                Target.DEFAULTDataSourceID = @FoundDataSourceID, 
                Target.IsDarkMode = @IsDarkMode, 
                Target.ModifiedOn = SYSUTCDATETIME(), 
                Target.ModifiedBy = @CurrentUser
        -- *** INSERT LOGIC MODIFIED: ModuleID is removed ***
        WHEN NOT MATCHED BY TARGET THEN
            INSERT (UserID, DEFAULTLanguageID, AppID, DEFAULTDataSourceID, IsDarkMode, CreatedBy)
            VALUES (@UserID, @FoundLanguageID, @FoundAppClientID, @FoundDataSourceID, @IsDarkMode, @CurrentUser);
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END