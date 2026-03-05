




CREATE PROCEDURE [dbo].[spGetUserCreditInfo]
    @ExecutingUserEmail NVARCHAR(255),
    @DateFilter NVARCHAR(20) = 'all',
    @StartDateCustom DATETIME = NULL,
    @EndDateCustom DATETIME = NULL

    /*
	Object Name : dbo.spGetUserCreditInfo
    Object Type : StoredProcedure
    Object:dbo.spGetUserCreditInfo
    Purpose: Fetches user credit and token information based on the role of the executing user.
    Modification: Updated to use the new schema with MonthlyCredits and RemainingCredits.
    */

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

    DECLARE @IsSuperAdmin BIT = 0, @TenantId UNIQUEIDENTIFIER, @ExecutingUserId UNIQUEIDENTIFIER;
    SELECT TOP 1 @ExecutingUserId = u.UserId, @IsSuperAdmin = u.IsSuperAdmin, @TenantId = tu.TenantId
    FROM dbo.Users u LEFT JOIN dbo.UserRoles tu ON u.UserId = tu.UserId
    WHERE u.UserEmail = @ExecutingUserEmail AND u.IsActive = 1;

    IF @IsSuperAdmin = 1
    BEGIN
        SELECT
            u.UserId, u.UserName, u.UserEmail,
            appS.MonthlyCredits,        -- CORRECT: The monthly credit rule from ApplicationSettings
            appS.TokensPerCredit,
            ua.RemainingCredits,        -- CORRECT: The user's current credit balance from UserApplication
            ua.ConsumedInputTokens,
            ua.ConsumedOutputTokens,
            ua.ConsumedTokens,
            ua.AvailableTokens,         -- CORRECT: The computed column showing available tokens
            t.TenantName, a.AppId
        FROM dbo.Users u
        JOIN dbo.UserApplication ua ON u.UserId = ua.UserId
        JOIN [dbo].[Application] a ON ua.AppId = a.AppId
        JOIN dbo.Tenants t ON a.TenantId = t.TenantId
        LEFT JOIN [dbo].[ApplicationSettings] appS ON a.AppId = appS.AppId
        WHERE u.IsActive = 1
        AND ua.CreatedOn >= COALESCE(@StartDateCustom, @StartDate)
        AND ua.CreatedOn < DATEADD(day, 1, COALESCE(@EndDateCustom, GETUTCDATE()))
        ORDER BY t.TenantName, u.UserName, a.AppId;
    END
    ELSE IF EXISTS (SELECT 1 FROM dbo.UserRoles tu JOIN dbo.Roles r ON tu.RoleId = r.RoleId WHERE tu.UserId = @ExecutingUserId AND r.RoleName = 'Admin' AND tu.TenantId = @TenantId)
    BEGIN
        SELECT
            u.UserId, u.UserName, u.UserEmail,
            appS.MonthlyCredits,
            appS.TokensPerCredit,
            ua.RemainingCredits,
            ua.ConsumedInputTokens, ua.ConsumedOutputTokens,
            ua.ConsumedTokens, ua.AvailableTokens,
            (SELECT TenantName FROM Tenants WHERE TenantId = @TenantId) AS TenantName,
            a.AppId
        FROM dbo.Users u
        JOIN dbo.UserApplication ua ON u.UserId = ua.UserId
        JOIN [dbo].[Application] a ON ua.AppId = a.AppId
        LEFT JOIN [dbo].[ApplicationSettings] appS ON a.AppId = appS.AppId
        WHERE a.TenantId = @TenantId AND u.IsActive = 1
        AND ua.CreatedOn >= COALESCE(@StartDateCustom, @StartDate)
        AND ua.CreatedOn < DATEADD(day, 1, COALESCE(@EndDateCustom, GETUTCDATE()))
        ORDER BY u.UserName, a.AppId;
    END
    ELSE
    BEGIN
        SELECT
            u.UserId, u.UserName, u.UserEmail,
            appS.MonthlyCredits,
            appS.TokensPerCredit,
            ua.RemainingCredits,
            ua.ConsumedInputTokens, ua.ConsumedOutputTokens,
            ua.ConsumedTokens, ua.AvailableTokens,
            (SELECT TenantName FROM Tenants WHERE TenantId = @TenantId) AS TenantName,
            a.AppId
        FROM dbo.Users u
        JOIN dbo.UserApplication ua ON u.UserId = ua.UserId
        JOIN [dbo].[Application] a ON ua.AppId = a.AppId
        LEFT JOIN [dbo].[ApplicationSettings] appS ON a.AppId = appS.AppId
        WHERE u.UserId = @ExecutingUserId AND u.IsActive = 1
        AND ua.CreatedOn >= COALESCE(@StartDateCustom, @StartDate)
        AND ua.CreatedOn < DATEADD(day, 1, COALESCE(@EndDateCustom, GETUTCDATE()))
        ORDER BY a.AppId;
    END
END