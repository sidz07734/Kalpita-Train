
/*
    Object Name : dbo.spGetPendingPublicApprovals
    Object Type : StoredProcedure
    Updated Date: 2025-11-12 11:20:35
    Updated By  : Vaishnavi Mohan
    Purpose     : Retrieves all pending public prompt approval requests for a given tenant. 
*/
-- Use ALTER to modify the existing procedure
CREATE PROCEDURE [dbo].[spGetPendingPublicApprovals]
    @TenantId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        pa.ApprovalId,
        pa.ChatId,
        pa.RequestDate,
        pa.RequesterUserId,
        
        -- FIX: Add user-friendly details by joining to the Users table
        ISNULL(u.UserName, 'Unknown User') AS RequesterName, 
        ISNULL(u.UserEmail, 'N/A') AS RequesterEmail,
        
        c.UserMessage
    FROM
        [dbo].[PublicPromptApprovals] pa
    INNER JOIN 
        [dbo].[Chats] c ON pa.ChatId = c.ChatId
    -- FIX: Use a LEFT JOIN to the Users table on the GUID
    LEFT JOIN 
        [dbo].[Users] u ON pa.RequesterUserId = u.UserId
    WHERE
        pa.TenantId = @TenantId
        AND pa.ApprovalStatus = 'Pending'
        AND pa.IsActive = 1
    ORDER BY
        pa.RequestDate ASC;
END