
CREATE PROCEDURE [dbo].[spGetFavoriteChats]
    @UserId NVARCHAR(255),      
    @TenantId UNIQUEIDENTIFIER,
    @AppId INT = NULL
/*
    Object Name : dbo.spGetFavoriteChats
    Object Type : StoredProcedure
    Created Date: 29-09-2025
    Created By  : Pravalika Konidala
    Purpose     : Retrieves all favorite [dbo].[Chats] of a user using their string-based ID.
                  If @AppId is passed, results are filtered for that app only.
*/
AS
BEGIN
    SET NOCOUNT ON;

    SELECT COUNT(*) AS FavoriteChats
    FROM [dbo].[Chats]
    WHERE TenantId = @TenantId
      AND UserId = @UserId
      AND IsFavorited = 1
      AND IsDeleted = 0
      AND (@AppId IS NULL OR AppId = @AppId);

    SELECT 
        c.ChatId,
        c.UserMessage,
        c.Timestamp,
        c.AppId
    FROM [dbo].[Chats] c
    WHERE c.TenantId = @TenantId
      AND c.UserId = @UserId
      AND c.IsFavorited = 1
      AND c.IsDeleted = 0
      AND (@AppId IS NULL OR c.AppId = @AppId)
    ORDER BY c.Timestamp DESC;
END