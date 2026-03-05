
CREATE PROCEDURE [dbo].[spGetUserChatHistory]
    @UserId NVARCHAR(255),      
    @TenantId UNIQUEIDENTIFIER,
    @AppId INT = NULL
/*
    Object Name : dbo.spGetUserChatHistory
    Object Type : StoredProcedure
    Created Date: 29-09-2025
    Created By  : Pravalika Konidala
    Purpose     : Retrieves a particular user's chat history (private + public) using their string-based ID. 
                  If @AppId is passed, results are filtered for that app only.
*/
AS
BEGIN
    SET NOCOUNT ON;


    SELECT COUNT(*) AS TotalChats
    FROM [dbo].[Chats] c
    WHERE c.TenantId = @TenantId
      AND c.IsDeleted = 0
      AND (c.UserId = @UserId OR c.Visibility = 'public')
      AND (@AppId IS NULL OR c.AppId = @AppId);

  
    SELECT 
        c.ChatId,
        c.UserMessage,
        c.AIResponse,
        c.Visibility,
        c.IsFavorited,
        c.Timestamp,
        c.AppId,
        STRING_AGG(t.TagName, ',') AS Tags
    FROM [dbo].[Chats] c
    LEFT JOIN [dbo].[ChatTags] ct ON c.ChatId = ct.ChatId
    LEFT JOIN dbo.Tags t ON ct.TagId = t.TagId
    WHERE c.TenantId = @TenantId
      AND c.IsDeleted = 0
      AND (c.UserId = @UserId OR c.Visibility = 'public')
      AND (@AppId IS NULL OR c.AppId = @AppId)
    GROUP BY c.ChatId, c.UserMessage, c.AIResponse, c.Visibility,
             c.IsFavorited, c.Timestamp, c.AppId
    ORDER BY c.Timestamp DESC;
END