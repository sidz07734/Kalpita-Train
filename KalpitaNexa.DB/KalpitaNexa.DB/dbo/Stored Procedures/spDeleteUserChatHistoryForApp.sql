


/*
    Object Name : dbo.sp_DeleteUserChatHistoryForApp
    Object Type : StoredProcedure
    Created Date: 30-10-2025
    Created By  : Archana Gudise
    Purpose     : Deletes old chat history for a specific user and app based on retention policy (ChatHistoryInDays) from ApplicationSettings using DATEDIFF.
*/

CREATE   PROCEDURE [dbo].[spDeleteUserChatHistoryForApp] -- Use CREATE OR ALTER for easier updates
(
    @UserId NVARCHAR(255),
    @AppId INT
)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ChatHistoryInDays INT;

    -- Step 1: Get chat retention days for the app
    SELECT @ChatHistoryInDays = ChatHistoryInDays
    FROM dbo.ApplicationSettings
    WHERE AppId = @AppId AND IsActive = 1;

    -- Step 2: Proceed only if a valid retention policy exists
    IF @ChatHistoryInDays IS NOT NULL AND @ChatHistoryInDays >= 0 -- Allow 0 to delete everything but today's
    BEGIN
        BEGIN TRY
            BEGIN TRANSACTION;

            -- Step 3: Delete chat records where the number of days passed is
            -- greater than or equal to the retention period.
            DELETE FROM dbo.Chats
            WHERE 
                UserId = @UserId
                AND AppId = @AppId
                AND DATEDIFF(day, CreatedOn, GETUTCDATE()) >= @ChatHistoryInDays;

            COMMIT TRANSACTION;

            -- Return success response
            SELECT 
                'Old chat history cleanup completed successfully.' AS Message,
                1 AS Success;
        END TRY
        BEGIN CATCH
            IF @@TRANCOUNT > 0
                ROLLBACK TRANSACTION;

            -- Return error response
            SELECT 
                ERROR_MESSAGE() AS ErrorMessage,
                0 AS Success;

            THROW;
        END CATCH;
    END
    ELSE
    BEGIN
        -- No retention rule found
        SELECT 
            'No chat deletion performed. Retention policy not found for this app.' AS Message,
            1 AS Success; -- This is not an error, just a no-op
    END
END;