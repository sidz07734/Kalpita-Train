
CREATE PROCEDURE [dbo].[spGetTaggedChats]
    @TagName NVARCHAR(50),
    @TenantId UNIQUEIDENTIFIER,
    @UserId NVARCHAR(255) = NULL,   
    @AppId INT = NULL
/*
    Object Name : dbo.spGetTaggedChats
    Object Type : StoredProcedure
    Created Date: 29-09-2025
    Created By  : Pravalika Konidala
    Purpose     : Retrieves [dbo].[Chats] tagged with a given tag, using the user's string-based ID.
                  Includes both user's [dbo].[Chats] and public [dbo].[Chats] of others.
                  If @AppId is passed, results are filtered for that app only.
*/
AS
BEGIN
    SET NOCOUNT ON;


    SELECT COUNT(DISTINCT c.ChatId) AS TaggedChats
    FROM [dbo].[Chats] c
    INNER JOIN [dbo].[ChatTags] ct ON c.ChatId = ct.ChatId
    INNER JOIN dbo.Tags t ON ct.TagId = t.TagId
    WHERE c.TenantId = @TenantId
      AND c.IsDeleted = 0
      AND t.TagName = @TagName
      AND (@AppId IS NULL OR c.AppId = @AppId)
      AND (@UserId IS NULL OR c.UserId = @UserId OR c.Visibility = 'public');

    SELECT 
        c.ChatId,
        c.UserMessage,
        c.Timestamp,
        c.AppId,
        STRING_AGG(t2.TagName, ',') AS Tags
    FROM [dbo].[Chats] c
    INNER JOIN [dbo].[ChatTags] ct ON c.ChatId = ct.ChatId
    INNER JOIN dbo.Tags t ON ct.TagId = t.TagId AND t.TagName = @TagName
    LEFT JOIN [dbo].[ChatTags] ct2 ON c.ChatId = ct2.ChatId
    LEFT JOIN dbo.Tags t2 ON ct2.TagId = t2.TagId
    WHERE c.TenantId = @TenantId
      AND c.IsDeleted = 0
      AND (@AppId IS NULL OR c.AppId = @AppId)
      AND (@UserId IS NULL OR c.UserId = @UserId OR c.Visibility = 'public')
    GROUP BY c.ChatId, c.UserMessage, c.Timestamp, c.AppId
    ORDER BY c.Timestamp DESC;
END