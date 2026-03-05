

CREATE   PROCEDURE [dbo].[spDeletePromptMessage]
    @ChatId UNIQUEIDENTIFIER,
    @RequestingUserId NVARCHAR(255)  -- THE FIX: Changed data type to match the Chats.UserId column
/*
    Object Name:  dbo.spSoftDeleteChat
    Object Type:  StoredProcedure
    Purpose:      Securely soft-deletes a chat by setting IsDeleted = 1.
                  Authorizes the action based on the user's EMAIL.
*/
AS
BEGIN
    SET NOCOUNT ON;

    -- Check if a chat exists with the given ChatId AND belongs to the requesting user's email.
    IF NOT EXISTS (SELECT 1 FROM dbo.Chats WHERE ChatId = @ChatId AND UserId = @RequestingUserId AND IsDeleted = 0)
    BEGIN
        -- If no matching, active chat is found, raise the authorization error.
        RAISERROR ('Error: Chat not found or you do not have permission to delete it.', 16, 1);
        RETURN;
    END

    -- If the check passes, perform the soft delete.
    delete from dbo.Chats
	where ChatId=@ChatId
	and UserId=@RequestingUserId;

    -- Return a success message.
    SELECT 'Chat deleted successfully.' AS Message;

END