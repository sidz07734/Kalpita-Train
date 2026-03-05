
/*
    Object Name : dbo.spRequestPublicApproval
    Object Type : StoredProcedure
    Modified Date: 2025-11-12 11:20:35
    Modified By  : Vaishnavi Mohan
    Purpose     :  Approves the users request to make a chat public
*/

-- Use ALTER to modify the existing procedure
CREATE PROCEDURE [dbo].[spRequestPublicApproval] 
    @ChatId UNIQUEIDENTIFIER,
    @TenantId UNIQUEIDENTIFIER,
    @RequesterUserId UNIQUEIDENTIFIER -- This remains a GUID, which is correct
AS
BEGIN
    SET NOCOUNT ON;
    
    -- FIX: Declare a variable to hold the user's email
    DECLARE @RequesterUserEmail NVARCHAR(255);

    -- FIX: Look up the user's email using their GUID from the Users table
    -- This assumes your users table is named [dbo].[Users]
    SELECT @RequesterUserEmail = [UserEmail] FROM [dbo].[Users] WHERE [UserId] = @RequesterUserId;

    IF @RequesterUserEmail IS NULL
    BEGIN
        RAISERROR('Requester user could not be found by the provided ID.', 16, 1);
        RETURN;
    END

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validate the request using the LOOKED-UP EMAIL
        -- FIX: The WHERE clause now correctly compares the email in Chats.
        IF NOT EXISTS (SELECT 1 FROM [dbo].[Chats] WHERE [ChatId] = @ChatId AND [UserId] = @RequesterUserEmail AND [TenantId] = @TenantId AND [IsDeleted] = 0)
        BEGIN
            RAISERROR('Chat not found or you do not have permission to modify it.', 16, 1);
            ROLLBACK TRANSACTION;
            RETURN;
        END

        -- 2. Check for an existing active request
        IF EXISTS (SELECT 1 FROM [dbo].[PublicPromptApprovals] WHERE [ChatId] = @ChatId AND [ApprovalStatus] IN ('Pending', 'Approved'))
        BEGIN
            RAISERROR('This chat is already pending approval or has been approved.', 16, 1);
            ROLLBACK TRANSACTION;
            RETURN;
        END

        -- 3. Insert into approvals table (this correctly uses the GUID)
        INSERT INTO [dbo].[PublicPromptApprovals] ([ChatId], [TenantId], [RequesterUserId], [ApprovalStatus])
        VALUES (@ChatId, @TenantId, @RequesterUserId, 'Pending');

        -- 4. Update the main [dbo].[Chats] table
        UPDATE [dbo].[Chats]
        SET 
            [PublicApprovalStatus] = 'Pending',
            [IsApproved] = 0,
            [ModifiedOn] = GETUTCDATE(),
            [ModifiedBy] = @RequesterUserEmail -- Store email for consistency
        WHERE 
            [ChatId] = @ChatId;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END