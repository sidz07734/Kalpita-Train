
CREATE PROCEDURE [dbo].[spGetPromptPublicMessages ]
    @TenantId UNIQUEIDENTIFIER,
    @AppId INT = NULL
/*
    Object Name : dbo.spGetPublicChats
    Object Type : StoredProcedure
    Created Date: 29-09-2025
    Created By  : Pravalika Konidala
    Purpose     : Retrieves all public [dbo].[Chats] (questions only, no AI responses).
                  If @AppId is passed, results are filtered for that app only.
*/
AS
BEGIN
    SET NOCOUNT ON;

    -- Counts
    SELECT COUNT(*) AS PublicChats
    FROM [dbo].[Chats]
    WHERE TenantId = @TenantId
      AND Visibility = 'public'
      AND IsDeleted = 0
      AND (@AppId IS NULL OR AppId = @AppId);

    -- Data
    SELECT 
        ChatId,
        UserMessage,
        Timestamp,
        AppId
    FROM [dbo].[Chats]
    WHERE TenantId = @TenantId
      AND Visibility = 'public'
      AND IsDeleted = 0
      AND (@AppId IS NULL OR AppId = @AppId)
    ORDER BY Timestamp DESC;
END