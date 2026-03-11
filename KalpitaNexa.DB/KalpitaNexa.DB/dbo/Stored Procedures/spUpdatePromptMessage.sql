

CREATE PROCEDURE [dbo].[spUpdatePromptMessage]
    @Id UNIQUEIDENTIFIER,           
    @UserId NVARCHAR(255),          
    @TenantId UNIQUEIDENTIFIER,    
    @AppId INT,                    
    @UserMessage NVARCHAR(MAX) = NULL,     
    @IsFavorited BIT = NULL,                
    @Visibility NVARCHAR(10) = NULL,        
    @ModifiedBy NVARCHAR(200)

    /*
    Object Name : dbo.spInsertMessage
    Object Type : StoredProcedure
    Created Date: 30-09-2025
    Created By  : Pravalika Konidala
    Purpose     : Inserts a new chat message into the [dbo].[Chats] table using the user's email (NVARCHAR) as the identifier.
    */
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @RowCount INT = 0;

    BEGIN TRANSACTION;
    BEGIN TRY

        UPDATE [dbo].[Chats]
        SET 
            UserMessage = ISNULL(@UserMessage, UserMessage),
            IsFavorited = ISNULL(@IsFavorited, IsFavorited),
            Visibility = ISNULL(@Visibility, Visibility),
            ModifiedOn = SYSUTCDATETIME(),
            ModifiedBy = @ModifiedBy
        WHERE 
            ChatId = @Id
            AND UserId = @UserId
            AND TenantId = @TenantId
            AND AppId = @AppId
            AND IsDeleted = 0;

        SET @RowCount = @@ROWCOUNT;

        IF @RowCount = 0
        BEGIN
            ROLLBACK TRANSACTION;
            RAISERROR ('Error: Chat not found, you are not authorized to modify it, or it does not belong to the specified AppId.', 16, 1);
            RETURN;
        END

        IF @UserMessage IS NOT NULL
        BEGIN

            DELETE FROM [dbo].[ChatTags] WHERE ChatId = @Id;

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
                @ModifiedBy 
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
                @ModifiedBy
            FROM dbo.Tags t
            INNER JOIN @TagTable tt ON t.TagName = tt.tag_name
            WHERE t.AppId = @AppId AND t.TenantId = @TenantId;
        END

        COMMIT TRANSACTION;

        SELECT 'Chat updated successfully' AS Message;

    END TRY
    BEGIN CATCH
     
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        THROW;
    END CATCH
END