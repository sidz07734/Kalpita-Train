CREATE PROCEDURE [dbo].[spGetUserTenants]
/*
	Object Name : dbo.spGetUserTenants
	Object Type : StoredProcedure
	Created Date: 30-09-2025
	Created By  : Vyshnavi Atthuluri
	Purpose     : Finds the Tenants for a User based on the User Email
*/
@UserEmail NVARCHAR(255)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @IsSuperAdmin BIT;

    -- ======================= THE FIX IS HERE =======================
    -- First, we check the user's role directly from the Users table.
    SELECT @IsSuperAdmin = IsSuperAdmin 
    FROM dbo.Users 
    WHERE UserEmail = @UserEmail AND IsActive = 1;

    IF @IsSuperAdmin = 1
    BEGIN
        -- THE SUPER ADMIN PATH:
        -- If the user is a Super Admin, we return ALL active tenants,
        -- ignoring the UserRoles table completely.
        SELECT DISTINCT
            u.UserEmail,
            u.UserId,
            t.TenantName,
            t.TenantId,
            u.IsSuperAdmin,
            (SELECT COUNT(*) FROM dbo.Tenants WHERE IsActive = 1) AS TotalTenants
        FROM 
            dbo.Tenants t
        CROSS JOIN -- This allows us to attach the user's info to every tenant row
            dbo.Users u
        WHERE 
            u.UserEmail = @UserEmail AND t.IsActive = 1
        ORDER BY
            t.TenantName;
    END
    ELSE
    BEGIN
        -- THE REGULAR USER PATH:
        -- If the user is not a Super Admin, we run your original logic, which is correct for regular users.
        SELECT
            UserEmail,
            UserId,
            TenantName,
            TenantId,
            IsSuperAdmin,
            COUNT(*) OVER() AS TotalTenants
        FROM
            (
                SELECT DISTINCT
                    u.UserEmail,
                    u.UserId,
                    t.TenantName,
                    t.TenantId,
                    u.IsSuperAdmin
                FROM
                    dbo.Users u
                    INNER JOIN dbo.UserRoles tu ON u.UserId = tu.UserId
                    INNER JOIN dbo.Tenants t ON tu.TenantId = t.TenantId
                WHERE
                    u.UserEmail = @UserEmail AND u.IsActive = 1 AND t.IsActive = 1 AND tu.IsActive = 1
            ) AS deduped
        ORDER BY
            TenantName;
    END
    -- =============================================================
END