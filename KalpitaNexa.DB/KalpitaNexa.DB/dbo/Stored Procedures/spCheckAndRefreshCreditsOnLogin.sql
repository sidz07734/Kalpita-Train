

CREATE PROCEDURE [dbo].[spCheckAndRefreshCreditsOnLogin]
/*
	Object Name : dbo.spCheckAndRefreshCreditsOnLogin
	Object Type : StoredProcedure
	Created By  : Your Name/Team
	Purpose     : Checks if a user's monthly credits are due for a refresh upon login.
                  If they are, it resets the credits based on [dbo].[Applicationettings] and updates the cycle date.
                  Returns the user's current credit status.
*/
(
    @UserEmail NVARCHAR(300),
    @AppName NVARCHAR(200)
)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @UserId UNIQUEIDENTIFIER;
    DECLARE @AppId INT;
    DECLARE @LastRefreshDate DATETIME2(7);
    DECLARE @NewMonthlyCredits INT;

    -- 1. Get the user's details, including the last refresh date for the specified application
    SELECT 
        @UserId = u.UserId,
        @AppId = ua.AppId,
        @LastRefreshDate = ua.LastCreditRefreshDate
    FROM dbo.Users u
    JOIN dbo.UserApplication ua ON u.UserId = ua.UserId
    JOIN [dbo].[Application] a ON ua.AppId = a.AppId
    WHERE u.UserEmail = @UserEmail AND a.ApplicationName = @AppName AND u.IsActive = 1;

    -- If the user or their assignment to the app doesn't exist, exit with an error
    IF @UserId IS NULL
    BEGIN
        RAISERROR('User not found or is not assigned to the specified application.', 16, 1);
        RETURN;
    END

    -- 2. Calculate the exact date the next refresh is due (the monthly anniversary)
    DECLARE @NextRefreshDueDate DATETIME2(7) = DATEADD(MONTH, 1, @LastRefreshDate);

    -- 3. Check if the current date is on or after the due date
    IF GETDATE() >= @NextRefreshDueDate
    BEGIN
        -- A new credit cycle is due. Get the latest credit amount from Applicationettings.
        SELECT @NewMonthlyCredits = MonthlyCredits 
        FROM [dbo].[Applicationettings] 
        WHERE AppId = @AppId AND IsActive = 1;

        IF @NewMonthlyCredits IS NOT NULL
        BEGIN
            -- Update credits, reset consumed tokens, and update the refresh date to now.
            UPDATE dbo.UserApplication
            SET 
                RemainingCredits = @NewMonthlyCredits, -- This REPLACES the old credits
                LastCreditRefreshDate = GETDATE(),    -- This update prevents the multiple-refresh bug
                ConsumedInputTokens = 0,
                ConsumedOutputTokens = 0
            WHERE UserId = @UserId AND AppId = @AppId;
        END
    END

    -- 4. Return the user's latest credit information to the application.
    -- This runs every time, returning fresh data whether a refresh occurred or not.
    SELECT 
        ua.UserId,
        ua.AppId,
        ua.RemainingCredits,
        ua.TokensPerCredit,
        ua.AvailableTokens,
        ua.ConsumedTokens,
        ua.LastCreditRefreshDate
    FROM dbo.UserApplication ua
    WHERE ua.UserId = @UserId AND ua.AppId = @AppId;

END;