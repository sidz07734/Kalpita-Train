

CREATE PROCEDURE [dbo].[spUserUpdateSelfProfile]
/*
	Object Name : dbo.spUserUpdateSelfProfile
	Object Type : StoredProcedure
	Created Date: 04-10-2025
	Created By  : Archana Gudise
	Purpose     : Allows a logged-in user to update their own name, email, and their
	              language/model preferences. Role changes are NOT permitted.
*/
(
    @ExecutingUserEmail NVARCHAR(300), -- The current, verified email of the logged-in user
    @NewUserName NVARCHAR(200),
    @NewUserEmail NVARCHAR(300),
    @LanguageNames dbo.NameList READONLY,
    @ModelNames dbo.NameList READONLY
)
AS
BEGIN
    SET NOCOUNT ON;
 
    -- Variable Declaration
    DECLARE @UserId UNIQUEIDENTIFIER;

    -- Table variables to hold resolved IDs
    DECLARE @ResolvedLanguageIds TABLE (ID INT);
    DECLARE @ResolvedModelIds TABLE (ID INT);
 
    -- 1. Identify the User
    -- Find the user based on their CURRENT email address from their session.
    SELECT @UserId = UserId 
    FROM dbo.Users 
    WHERE UserEmail = @ExecutingUserEmail AND IsActive = 1;

    IF @UserId IS NULL 
    BEGIN 
        RAISERROR('Your user account was not found or is inactive. Please log in again.', 16, 1); 
        RETURN; 
    END

    -- 2. Validate Inputs
    
    -- VALIDATION: Ensure the new email address is not already in use by ANOTHER user.
    IF EXISTS (SELECT 1 FROM dbo.Users WHERE UserEmail = @NewUserEmail AND UserId <> @UserId)
    BEGIN
        RAISERROR('This email address is already in use by another account.', 16, 1);
        RETURN;
    END

    -- Resolve Language Names to LanguageIDs
    INSERT INTO @ResolvedLanguageIds (ID)
    SELECT l.LanguageID FROM dbo.Languages l JOIN @LanguageNames n ON l.LanguageName = n.Name;

    IF (SELECT COUNT(*) FROM @LanguageNames) <> (SELECT COUNT(*) FROM @ResolvedLanguageIds)
    BEGIN RAISERROR('One or more selected language names are invalid.', 16, 1); RETURN; END

    -- Resolve [dbo].[Model] Names to ModelIDs
    INSERT INTO @ResolvedModelIds (ID)
    SELECT m.ModuleID FROM [dbo].[Model] m JOIN @ModelNames n ON m.ModuleName = n.Name;
    
    IF (SELECT COUNT(*) FROM @ModelNames) <> (SELECT COUNT(*) FROM @ResolvedModelIds)
    BEGIN RAISERROR('One or more selected [dbo].[Model] names are invalid.', 16, 1); RETURN; END

 
    -- 3. Use a Transaction for data integrity
    BEGIN TRANSACTION;
    BEGIN TRY

        -- Step 3.1: Update the user's core profile details in the main Users table.
        UPDATE dbo.Users
        SET 
            UserName = @NewUserName,
            UserEmail = @NewUserEmail,
            ModifiedBy = @ExecutingUserEmail, -- Log who made the change
            ModifiedOn = SYSDATETIME()
        WHERE UserId = @UserId;

        -- Step 3.2: Replace language assignments for the user.
        DELETE FROM dbo.UserLanguages WHERE UserId = @UserId;
        
        INSERT INTO dbo.UserLanguages(UserId, LanguageID, CreatedOn, CreatedBy)
        SELECT @UserId, ID, SYSDATETIME(), @ExecutingUserEmail
        FROM @ResolvedLanguageIds;

        -- Step 3.3: Replace [dbo].[Model] assignments for the user.
        DELETE FROM dbo.UserModels WHERE UserId = @UserId;
        
        INSERT INTO dbo.UserModels(UserId, ModelID, CreatedOn, CreatedBy)
        SELECT @UserId, ID, SYSDATETIME(), @ExecutingUserEmail
        FROM @ResolvedModelIds;
 
        COMMIT TRANSACTION;
 
        -- 4. Success: Return a success message.
        SELECT 'Your profile has been updated successfully.' AS Message, @UserId AS UserId;
 
    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION;
        THROW; -- Propagate the original error.
    END CATCH
END