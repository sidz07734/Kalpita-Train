
CREATE PROCEDURE [dbo].[spCreateSuperAdmin]
    @UserName NVARCHAR(200),
    @UserEmail NVARCHAR(300),
    @PasswordHash NVARCHAR(500),
    @DefaultAppId INT = NULL,
    @CreatedBy NVARCHAR(200)
    
/*
    Object Name : dbo.spCreateSuperAdmin
    Object Type : StoredProcedure
    Created Date: 2025-12-03
    Created By   : Pravalika Konidala
    Purpose      : Creates the FIRST Super Admin in the system.  
                   - Ensures that only one super admin can be created when none exists.
                   - Inserts record into Users and UserApplication.
*/

AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (SELECT 1 FROM dbo.Users WHERE IsSuperAdmin = 1)
    BEGIN
        SELECT 'A Super Admin already exists. You cannot create another one using this procedure.' AS Message,
               0 AS Success;
        RETURN;
    END

    IF @DefaultAppId IS NOT NULL
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM dbo.Application WHERE AppId = @DefaultAppId)
        BEGIN
            SELECT 'Invalid Application ID supplied.' AS Message, 0 AS Success;
            RETURN;
        END
    END

    BEGIN TRANSACTION;
    BEGIN TRY

        DECLARE @NewUserId UNIQUEIDENTIFIER = NEWID();

        INSERT INTO dbo.Users 
        (
            UserId, UserName, UserEmail, PasswordHash, 
            IsSuperAdmin, IsActive, CreatedBy, DefaultAppId
        )
        VALUES
        (
            @NewUserId, @UserName, @UserEmail, @PasswordHash,
            1, 1, @CreatedBy, @DefaultAppId
        );

        IF @DefaultAppId IS NOT NULL
        BEGIN
            INSERT INTO dbo.UserApplication
            (
                UserId, AppId, CreatedBy
            )
            VALUES
            (
                @NewUserId, @DefaultAppId, @CreatedBy
            );
        END

        COMMIT TRANSACTION;

        SELECT 'Super Admin created successfully.' AS Message,
               1 AS Success,
               @NewUserId AS UserId,
               @DefaultAppId AS AppId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;

        SELECT ERROR_MESSAGE() AS Message, 0 AS Success;
    END CATCH

END