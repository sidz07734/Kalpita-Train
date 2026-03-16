

CREATE PROCEDURE [dbo].[spGetUserProfile]
/*
	Object Name : dbo.spGetUserProfile
	Object Type : StoredProcedure
	Created Date: 04-10-2025
	Created By  : Archana Gudise
	Purpose     : Fetches a complete user profile including their assigned roles,
	              languages, and models for use after login.
*/
(
    @UserEmail NVARCHAR(300)
)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @UserId UNIQUEIDENTIFIER;

    -- 1. Find the user
    SELECT @UserId = UserId FROM dbo.Users WHERE UserEmail = @UserEmail AND IsActive = 1;

    IF @UserId IS NULL
    BEGIN
        RAISERROR('User not found or is inactive.', 16, 1);
        RETURN;
    END

    -- 2. Return Basic User Info (First Result Set)
    -- +++ START OF FIX +++
    -- Added the CreatedOn and CreatedBy columns to the SELECT statement.
    SELECT
        UserId,
        UserName,
        UserEmail,
        IsSuperAdmin,
        CreatedOn,
        CreatedBy
    -- +++ END OF FIX +++
    FROM dbo.Users
    WHERE UserId = @UserId;

    -- 3. Return Assigned Roles (Second Result Set)
    SELECT 
        r.RoleName
    FROM dbo.UserRoles tu
    JOIN dbo.Roles r ON tu.RoleId = r.RoleId
    WHERE tu.UserId = @UserId AND tu.IsActive = 1;

    -- 4. Return Assigned Languages (Third Result Set)
    SELECT
        l.LanguageID,
        l.LanguageName
    FROM dbo.UserApplication ua
    JOIN dbo.Languages l ON ua.DefaultLanguageId = l.LanguageID
    WHERE ua.UserId = @UserId;

    -- 5. Return Assigned Models (Fourth Result Set)
    SELECT
        m.ModuleID AS ModelID,
        m.ModuleName AS ModelName
    FROM dbo.UserApplication um
    JOIN [dbo].[Model] m ON um.DefaultModelId = m.ModuleID
    WHERE um.UserId = @UserId;
	

END