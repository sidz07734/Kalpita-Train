

CREATE   PROCEDURE [dbo].[spUpdateUserPreference]
/*
    Object Name : dbo.spSetUserPreference
    Object Type : StoredProcedure
    Modified Date: 13-11-2025
    Modified By  : Vaishnavi Mohan
    Purpose     : Sets or updates a user’s language and model preferences for a given application.
                  If the user already has a preference record, it updates the existing entry;
                  otherwise, it inserts a new one.
*/

    @UserEmail NVARCHAR(255),
    @AppID INT,
    @LanguageID INT,
    @ModelID INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @UserID UNIQUEIDENTIFIER;
    SELECT @UserID = UserId FROM dbo.Users WHERE UserEmail = @UserEmail;

    IF @UserID IS NULL
    BEGIN
        RAISERROR('User not found.', 16, 1);
        RETURN;
    END

    -- Check if a preference for this user and app already exists
    IF EXISTS (SELECT 1 FROM dbo.UserSettings WHERE UserID = @UserID AND AppID = @AppID)
    BEGIN
        -- UPDATE the existing row
        UPDATE dbo.UserSettings
        SET 
            DefaultLanguageID = @LanguageID,
            DefaultModelID = @ModelID,
            ModifiedOn = SYSUTCDATETIME(),
            ModifiedBy = @UserEmail
        WHERE 
            UserID = @UserID AND AppID = @AppID;
        
        SELECT 'Preferences updated successfully.' AS Message;
    END
    ELSE
    BEGIN
        -- INSERT a new row
        INSERT INTO dbo.UserSettings (UserID, AppID, DefaultLanguageID, DefaultModelID, CreatedBy)
        VALUES (@UserID, @AppID, @LanguageID, @ModelID, @UserEmail);

        SELECT 'Preferences saved successfully.' AS Message;
    END
END