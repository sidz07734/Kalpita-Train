

/*
    Object Name : dbo.spGetUserDefaults
    Object Type : StoredProcedure
    Created Date: 2025-11-12 11:20:35
    Created By  : Vaishnavi Mohan
    Purpose     : getting all the user default values like DefaultApp,DefaultLanguage,DefaultModel
*/

CREATE PROCEDURE [dbo].[spGetUserDefaults]
    @UserId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @DefaultAppId INT;
    DECLARE @DefaultLanguageId INT;
    DECLARE @DefaultModelId INT;
    DECLARE @UserExists BIT = 0;

    -- Check if user exists and is active
    IF EXISTS (SELECT 1 FROM dbo.Users WHERE UserId = @UserId AND IsActive = 1)
        SET @UserExists = 1;

    IF @UserExists = 0
    BEGIN
        -- Return empty result for non-existent or inactive user
        SELECT 
            NULL AS DefaultAppId,
            NULL AS DefaultAppName,
            NULL AS DefaultLanguageId,
            NULL AS DefaultLanguageName,
            NULL AS DefaultModelId,
            NULL AS DefaultModelName;
        RETURN;
    END

    -- Get user's stored default app
    SELECT @DefaultAppId = DefaultAppId
    FROM Users
    WHERE UserId = @UserId;

    -- If no default app set, get first app from dbo.UserApplication (ordered by creation date)
    IF @DefaultAppId IS NULL
    BEGIN
        SELECT TOP 1 
            @DefaultAppId = ua.AppId
        FROM dbo.UserApplication ua
        INNER JOIN [dbo].[Application] app ON ua.AppId = app.AppId
        WHERE ua.UserId = @UserId AND app.IsActive = 1
        ORDER BY ua.CreatedOn ASC, app.ApplicationName ASC;
    END

    -- If still NULL (user has no dbo.UserApplication entries), get first app from [dbo].[Applications] table
    IF @DefaultAppId IS NULL
    BEGIN
        SELECT TOP 1 
            @DefaultAppId = AppId
        FROM Application
        WHERE IsActive = 1
        ORDER BY AppId ASC;
    END

    -- Get defaults from dbo.UserApplication for the selected application (if exists)
    SELECT 
        @DefaultLanguageId = DefaultLanguageId,
        @DefaultModelId = DefaultModelId
    FROM UserApplication
    WHERE UserId = @UserId AND AppId = @DefaultAppId;

    -- If no default language, get first language (by ID)
    IF @DefaultLanguageId IS NULL
    BEGIN
        SELECT TOP 1 
            @DefaultLanguageId = LanguageID
        FROM Languages
        ORDER BY LanguageID ASC;
    END

    -- If no default model, get first [dbo].[Model] (by ID)
    IF @DefaultModelId IS NULL
    BEGIN
        SELECT TOP 1 
            @DefaultModelId = ModuleID
        FROM Model
        ORDER BY ModuleID ASC;
    END

    -- Return the resolved defaults with names
    SELECT 
        @DefaultAppId AS DefaultAppId,
        app.ApplicationName AS DefaultAppName,
        @DefaultLanguageId AS DefaultLanguageId,
        l.LanguageName AS DefaultLanguageName,
        @DefaultModelId AS DefaultModelId,
        m.ModuleName AS DefaultModelName
    FROM 
        (SELECT 1 AS DummyColumn) AS Dummy
    LEFT JOIN [dbo].[Application] app ON app.AppId = @DefaultAppId
    LEFT JOIN dbo.Languages l ON l.LanguageID = @DefaultLanguageId
    LEFT JOIN [dbo].[Model] m ON m.ModuleID = @DefaultModelId;
END