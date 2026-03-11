
CREATE PROCEDURE [dbo].[spUpsertApplication]
    @AppId INT,
    @TenantId UNIQUEIDENTIFIER,
    @ApplicationName NVARCHAR(200),
    @IsActive BIT,
    @ExecutingUser NVARCHAR(200)
AS
/*
	Object Name : dbo.spUpsertApplication
    Object Type : StoredProcedure
    Purpose: Inserts a new application if it does not exist, or updates an existing application based on the ClientId.
    Author: Pravalika Konidala
    Date Created: 2025-11-18
    Modification: Initial creation.
*/
BEGIN
    SET NOCOUNT ON;

    -- Check if a valid AppId was provided for an update
    IF @AppId > 0
    BEGIN
        -- An AppId was provided, so attempt to UPDATE the existing record.
        UPDATE [dbo].[Application]
        SET
            [TenantId] = @TenantId,
            [ApplicationName] = @ApplicationName,
            [IsActive] = @IsActive,
            [ModifiedOn] = SYSUTCDATETIME(),
            [ModifiedBy] = @ExecutingUser
        WHERE
            [AppId] = @AppId;
    END
    ELSE
    BEGIN
        -- AppId is 0 or null, so INSERT a new record.
        -- We generate a new ClientId automatically since it's required to be unique.
        INSERT INTO [dbo].[Application] (
            [TenantId],
            [ClientId],
            [ApplicationName],
            [IsActive],
            [CreatedBy]
        )
        VALUES (
            @TenantId,
            CONVERT(NVARCHAR(200), NEWID()), 
            @ApplicationName,
            @IsActive,
            @ExecutingUser
        );
    END
END