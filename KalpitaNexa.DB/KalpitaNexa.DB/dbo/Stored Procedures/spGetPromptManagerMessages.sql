
CREATE PROCEDURE [dbo].[spGetPromptManagerMessages]
    @TenantId UNIQUEIDENTIFIER,
    @UserId NVARCHAR(255),
    @AppId INT = NULL  -- This parameter is the key. If NULL, it's ignored.
/*
    Object Name : dbo.spGetQuestionManagerChats
    Object Type : StoredProcedure
    Created Date: 06-10-2025
    Purpose     : Retrieves all relevant [dbo].[Chats] for the Question Manager.
                  - Filters by a specific AppId if provided.
                  - If @AppId is NULL, it returns [dbo].[Chats] from ALL [dbo].[Applications] for the user.
                  - Includes the user's own [dbo].[Chats] and public [dbo].[Chats] from others within the tenant.
*/
AS
BEGIN
    SET NOCOUNT ON;

    SELECT COUNT(DISTINCT c.ChatId) AS TotalChats
    FROM [dbo].[Chats] c
    WHERE
        c.TenantId = @TenantId
        AND c.IsDeleted = 0
        AND (c.UserId = @UserId OR c.Visibility = 'public')
        AND (@AppId IS NULL OR c.AppId = @AppId);

    SELECT
        c.ChatId,
        c.UserMessage,
        c.Timestamp,
        c.AppId,
        c.Visibility,
        c.IsFavorited,
        STRING_AGG(t.TagName, ', ') WITHIN GROUP (ORDER BY t.TagName) AS Tags
    FROM
        [dbo].[Chats] c
        LEFT JOIN [dbo].[ChatTags] ct ON c.ChatId = ct.ChatId
        LEFT JOIN dbo.Tags t ON ct.TagId = t.TagId
    WHERE
        c.TenantId = @TenantId
        AND c.IsDeleted = 0
        AND (c.UserId = @UserId OR c.Visibility = 'public')
        AND (@AppId IS NULL OR c.AppId = @AppId) 
    GROUP BY
        c.ChatId, c.UserMessage, c.Timestamp, c.AppId, c.Visibility, c.IsFavorited
    ORDER BY
        c.Timestamp DESC;
END