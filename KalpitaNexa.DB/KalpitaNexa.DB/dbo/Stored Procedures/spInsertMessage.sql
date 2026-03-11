


CREATE PROCEDURE [dbo].[spInsertMessage]
    @Id UNIQUEIDENTIFIER,
    @UserId NVARCHAR(255),          
    @TenantId UNIQUEIDENTIFIER,
    @ClientId NVARCHAR(255),
    @AppId INT,
    @UserMessage NVARCHAR(MAX),
    @AIResponse NVARCHAR(MAX),
    @PromptTokens INT,
    @ResponseTokens INT,
    @IsFavorited BIT = 0,
    @IsFlagged BIT = 0,
    @Visibility NVARCHAR(10) = 'private',
    @FileId UNIQUEIDENTIFIER = NULL,
    @CreatedBy NVARCHAR(200) = 'system'
/*
    Object Name : dbo.spInsertMessage
	object type: Procedure
    Purpose     : Inserts a new chat message and updates the user's token consumption FOR A SPECIFIC APP.
    Modification: Logic now checks and deducts tokens from the dbo.UserApplication table based on UserId and AppId.
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TotalTokensForRequest INT = @PromptTokens + @ResponseTokens;
    DECLARE @AvailableTokens BIGINT;
    DECLARE @UserIdGUID UNIQUEIDENTIFIER;

    SELECT @UserIdGUID = u.UserId FROM dbo.Users u WHERE u.UserEmail = @UserId AND u.IsActive = 1;

    IF @UserIdGUID IS NULL
    BEGIN
        RAISERROR('User not found or is inactive. Cannot process chat.', 16, 1);
        RETURN;
    END

    SELECT @AvailableTokens = ua.AvailableTokens 
    FROM dbo.UserApplication ua 
    WHERE ua.UserId = @UserIdGUID AND ua.AppId = @AppId;

    IF @AvailableTokens IS NULL
    BEGIN
        RAISERROR('User is not assigned to this application. Access denied.', 16, 1);
        RETURN;
    END

    IF @AvailableTokens < @TotalTokensForRequest
    BEGIN
        RAISERROR('Insufficient credits for this application. You do not have enough tokens to complete this request.', 16, 1);
        RETURN;
    END
    
    BEGIN TRANSACTION;
    BEGIN TRY

        INSERT INTO [dbo].[Chats] (
            ChatId, UserId, TenantId, AppId, UserMessage, AIResponse, 
            PromptTokens, ResponseTokens, IsFavorited, IsFlagged, 
            Visibility, FileId, CreatedBy
        )
        VALUES (
            @Id, @UserId, @TenantId, @AppId, @UserMessage, @AIResponse,
            @PromptTokens, @ResponseTokens, @IsFavorited, @IsFlagged,
            @Visibility, @FileId, @CreatedBy
        );

        UPDATE dbo.UserApplication
        SET 
            ConsumedInputTokens = ConsumedInputTokens + @PromptTokens,
            ConsumedOutputTokens = ConsumedOutputTokens + @ResponseTokens
        WHERE UserId = @UserIdGUID AND AppId = @AppId;
        DECLARE @TagTable TABLE (tag_name NVARCHAR(50));
        
        WITH SplitWords AS (
            SELECT value as word
            FROM STRING_SPLIT(@UserMessage, ' ')
        )
        INSERT INTO @TagTable (tag_name)
        SELECT DISTINCT LOWER(SUBSTRING(word, 2, LEN(word)))
        FROM SplitWords
        WHERE word LIKE '#%' AND LEN(word) > 1;

        INSERT INTO dbo.Tags (TagName, AppId, TenantId, CreatedBy)
        SELECT 
            tt.tag_name, 
            @AppId, 
            @TenantId,
            @CreatedBy
        FROM @TagTable tt
        WHERE NOT EXISTS (
            SELECT 1 
            FROM dbo.Tags t 
            WHERE t.TagName = tt.tag_name 
              AND t.AppId = @AppId
              AND t.TenantId = @TenantId
        );

        INSERT INTO [dbo].[ChatTags] (ChatId, TagId, AppId, CreatedBy)
        SELECT 
            @Id, 
            t.TagId, 
            @AppId,
            @CreatedBy
        FROM dbo.Tags t
        INNER JOIN @TagTable tt ON t.TagName = tt.tag_name
        WHERE t.AppId = @AppId AND t.TenantId = @TenantId;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        THROW;
    END CATCH
END