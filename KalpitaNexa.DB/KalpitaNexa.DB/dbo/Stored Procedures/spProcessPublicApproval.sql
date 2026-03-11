
/*
    Object Name : dbo.spProcessPublicApproval
    Object Type : StoredProcedure
    Modified Date: 2025-11-12 11:20:35
    Modified By  : Vaishnavi Mohan
    Purpose     : Processes pending public prompt approval requests by updating their approval status
                  and synchronizing the related chat’s visibility and approval metadata.
*/

-- Use ALTER to modify the existing procedure
CREATE PROCEDURE [dbo].[spProcessPublicApproval]
    @ApprovalId UNIQUEIDENTIFIER,
    @ApproverUserId UNIQUEIDENTIFIER, -- This remains a GUID
    @NewStatus NVARCHAR(20),
    @AdminComments NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ChatId UNIQUEIDENTIFIER;
    -- FIX: Declare a variable for the approver's email
    DECLARE @ApproverUserEmail NVARCHAR(255);

    -- FIX: Look up the approver's email from their GUID
    SELECT @ApproverUserEmail = [UserEmail] FROM [dbo].[Users] WHERE [UserId] = @ApproverUserId;

    IF @ApproverUserEmail IS NULL
    BEGIN
        RAISERROR('Approver user could not be found by their ID.', 16, 1);
        RETURN;
    END

    IF @NewStatus NOT IN ('Approved', 'Rejected')
    BEGIN
        RAISERROR('Invalid status. Must be ''Approved'' or ''Rejected''.', 16, 1);
        RETURN;
    END

    SELECT @ChatId = [ChatId] FROM [dbo].[PublicPromptApprovals] WHERE [ApprovalId] = @ApprovalId AND [ApprovalStatus] = 'Pending';

    IF @ChatId IS NULL
    BEGIN
        RAISERROR('Approval request not found or has already been processed.', 16, 1);
        RETURN;
    END

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Update the approval request (this correctly uses the GUID)
        UPDATE [dbo].[PublicPromptApprovals]
        SET 
            [ApprovalStatus] = @NewStatus,
            [ApproverUserId] = @ApproverUserId,
            [ApprovalDate] = GETUTCDATE(),
            [AdminComments] = @AdminComments
        WHERE 
            [ApprovalId] = @ApprovalId;

        -- 2. Update the corresponding Chat record
        UPDATE [dbo].[Chats]
        SET
            [Visibility] = CASE WHEN @NewStatus = 'Approved' THEN 'public' ELSE 'private' END,
            [PublicApprovalStatus] = @NewStatus,
            [IsApproved] = CASE WHEN @NewStatus = 'Approved' THEN 1 ELSE 0 END,
            [ModifiedOn] = GETUTCDATE(),
            [ModifiedBy] = @ApproverUserEmail -- Store the approver's email
        WHERE
            [ChatId] = @ChatId;

        COMMIT TRANSACTION;
        SELECT @ChatId AS ProcessedChatId;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END