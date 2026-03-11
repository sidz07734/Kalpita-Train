

/****** Object:  StoredProcedure [dbo].[spInsertMessage]    Script Date: 24-10-2025 10:41:43 ******/
CREATE PROCEDURE [dbo].[spUploadFile]
    @Id UNIQUEIDENTIFIER,          
    @UserId NVARCHAR(255),         
    @TenantId UNIQUEIDENTIFIER,
    @AppId INT,
    @ClientId NVARCHAR(255),
    @FileName NVARCHAR(255),
    @FileType NVARCHAR(50),
    @FileSize INT,
    @FileContent VARBINARY(MAX)
/*
    Object Name : dbo.spUploadFile
	Object Type: StoredProcedure
    Purpose     : Inserts a new file record into the Files table.
                  It looks up the User's GUID from their email address.
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @UserGUID UNIQUEIDENTIFIER;

    SELECT @UserGUID = UserId 
    FROM dbo.Users 
    WHERE UserId = @UserId AND IsActive = 1;

    IF @UserGUID IS NULL
    BEGIN
        RAISERROR('User with the specified email does not exist or is inactive.', 16, 1);
        RETURN;
    END

    INSERT INTO dbo.Files (
        FileId,
        TenantId,
        UserId,         
        AppId,
        ClientId,
        FileName,
        FileType,
        FileSize,
        FileContent,
        CreatedBy      
    )
    VALUES (
        @Id,
        @TenantId,
        @UserGUID,      
        @AppId,
        @ClientId,
        @FileName,
        @FileType,
        @FileSize,
        @FileContent,
        @UserId         
    );
END