
CREATE PROCEDURE [dbo].[spDeleteDataSource]
    @DataSourceId INT,
    @AppId INT
AS
/*
	Object Name : dbo.spDeleteDataSource
    Object Type : StoredProcedure
    Purpose: Deletes a data source for a specific application.
    Author: Madhan Kumar
    Date Created: 2025-11-19
*/
BEGIN
    SET NOCOUNT ON;

    -- Attempt to delete the record where both DataSourceId and AppId match
    DELETE FROM [dbo].[DataSources]
    WHERE
        [DataSourceId] = @DataSourceId
        AND [AppId] = @AppId;

    -- Check if a row was actually deleted
    -- If @@ROWCOUNT is 0, it means no matching record was found.
    IF @@ROWCOUNT = 0
    BEGIN
        -- Raise a server error to signal that the record was not found.
        -- This error will be caught by the API.
        RAISERROR('Delete failed: Data source with the specified ID and AppId was not found.', 16, 1);
        RETURN;
    END
END