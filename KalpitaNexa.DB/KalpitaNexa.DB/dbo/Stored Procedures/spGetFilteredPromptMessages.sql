
CREATE PROCEDURE [dbo].[spGetFilteredPromptMessages]
/*
	Object Name : dbo.spGetFilteredPromptMessages
	Object Type : StoredProcedure
	Updated Date: 29-09-2025
	Updated By  : Vaishnavi Mohan
	Purpose     : Retrieves the prompt messages according to the filtered conditions like last 7 days
*/
    @UserId NVARCHAR(255),
    @TenantId UNIQUEIDENTIFIER,
    @AppId INT = NULL,
    @Category NVARCHAR(50), 
    @TagName NVARCHAR(50) = NULL,
    @DateFilter NVARCHAR(20) = 'all',
    @StartDateCustom DATETIME = NULL,
    @EndDateCustom DATETIME = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @StartDate DATETIME;
    SET @StartDate = CASE @DateFilter
        WHEN 'lastWeek' THEN DATEADD(WEEK, -1, GETUTCDATE())
        WHEN 'lastMonth' THEN DATEADD(MONTH, -1, GETUTCDATE())
        WHEN 'last6Months' THEN DATEADD(MONTH, -6, GETUTCDATE())
        WHEN 'lastYear' THEN DATEADD(YEAR, -1, GETUTCDATE())
        ELSE '1970-01-01' 
    END;

    DECLARE @FilteredChatIDs TABLE (ChatId UNIQUEIDENTIFIER);

    INSERT INTO @FilteredChatIDs (ChatId)
    SELECT c.ChatId
    FROM [dbo].[Chats] c
    LEFT JOIN [dbo].[ChatTags] ct ON c.ChatId = ct.ChatId
    LEFT JOIN dbo.Tags t ON ct.TagId = t.TagId
    WHERE 
        c.IsDeleted = 0
        AND (@AppId IS NULL OR c.AppId = @AppId)
        AND c.TenantId = @TenantId
        AND c.Timestamp >= COALESCE(@StartDateCustom, @StartDate)
        AND c.Timestamp < DATEADD(day, 1, COALESCE(@EndDateCustom, GETUTCDATE()))
        AND (
            (@Category = 'myhistory' AND c.UserId = @UserId)
            OR
            (@Category = 'public' AND c.Visibility = 'public')
            OR
            (@Category = 'favorites' AND c.UserId = @UserId AND c.IsFavorited = 1)
            OR
            (@Category = 'tags' AND t.TagName = @TagName AND (c.UserId = @UserId OR c.Visibility = 'public'))
        );

    SELECT COUNT(DISTINCT ChatId) AS TotalChats FROM @FilteredChatIDs;

    SELECT 
        c.ChatId,
        c.UserMessage,
        c.AIResponse,
        c.Visibility,
        c.IsFavorited,
        c.Timestamp,
        c.AppId,
        (
            SELECT STRING_AGG(t.TagName, ',')
            FROM [dbo].[ChatTags] ct_inner
            JOIN dbo.Tags t ON ct_inner.TagId = t.TagId
            WHERE ct_inner.ChatId = c.ChatId
        ) AS Tags
    FROM [dbo].[Chats] c
    WHERE c.ChatId IN (SELECT ChatId FROM @FilteredChatIDs)
    ORDER BY c.Timestamp DESC;

END