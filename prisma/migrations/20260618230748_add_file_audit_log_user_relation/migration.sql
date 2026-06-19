-- AddForeignKey
ALTER TABLE "file_audit_logs" ADD CONSTRAINT "file_audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
