
CREATE PROCEDURE [dbo].[spUpdateMessageFeedback]
    @ChatId UNIQUEIDENTIFIER,
    @UserId NVARCHAR(255),
    @TenantId UNIQUEIDENTIFIER,
    @AppId INT,
    @Feedback INT,
    @ModifiedBy NVARCHAR(200)
/*
    Object Name : dbo.spUpdateMessageFeedback
    Object Type : StoredProcedure
    Created Date: 07-10-2025
    Created By  : Pravalika Konidala
    Purpose     : Updates the user_feedback for a specific chat, validating against user, tenant, and app.
*/
AS
BEGIN
    SET NOCOUNT ON;

    IF @Feedback NOT IN (-1, 0, 1)
    BEGIN
        RAISERROR ('Invalid feedback value. Must be -1 (dislike), 0 (neutral), or 1 (like).', 16, 1);
        RETURN;
    END

    IF NOT EXISTS (
        SELECT 1
        FROM [dbo].[Chats]
        WHERE ChatId = @ChatId
          AND UserId = @UserId
          AND TenantId = @TenantId
          AND AppId = @AppId
          AND IsDeleted = 0
    )
    BEGIN
        RAISERROR ('Authorization failed: Message not found or you do not have permission to update it.', 16, 1);
        RETURN;
    END

    BEGIN TRY
        UPDATE [dbo].[Chats]
        SET 
            UserFeedback = @Feedback,
            ModifiedOn = SYSUTCDATETIME(),
            ModifiedBy = @ModifiedBy
        WHERE 
            ChatId = @ChatId;

        SELECT 'Feedback updated successfully.' AS Message;

    END TRY
    BEGIN CATCH

        THROW;
    END CATCH
END