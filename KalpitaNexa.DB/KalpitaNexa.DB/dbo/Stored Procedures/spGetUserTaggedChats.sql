
CREATE PROCEDURE [dbo].[spGetUserTaggedChats]
    @TenantId UNIQUEIDENTIFIER,
    @UserId NVARCHAR(255) = NULL,   
    @AppId INT = NULL
/*
    Object Name : dbo.spGetUserTaggedChats
    Object Type : StoredProcedure
    Created Date: 06-10-2025
    Purpose     : Retrieves all [dbo].[Chats] that have at least one tag for a given user.
                  Includes both the user's own [dbo].[Chats] and public [dbo].[Chats] of others.
                  If @AppId is passed, results are filtered for that app only.
*/
AS
BEGIN
    SET NOCOUNT ON;

    SELECT 
        c.ChatId,
        c.UserMessage,
        c.Timestamp,
        c.AppId,
        STRING_AGG(t.TagName, ',') AS Tags
    FROM [dbo].[Chats] c
    INNER JOIN [dbo].[ChatTags] ct ON c.ChatId = ct.ChatId
    INNER JOIN dbo.Tags t ON ct.TagId = t.TagId
    WHERE c.TenantId = @TenantId
      AND c.IsDeleted = 0
      AND (@AppId IS NULL OR c.AppId = @AppId)
      AND (@UserId IS NULL OR c.UserId = @UserId OR c.Visibility = 'public')
    GROUP BY c.ChatId, c.UserMessage, c.Timestamp, c.AppId
    ORDER BY c.Timestamp DESC;
END