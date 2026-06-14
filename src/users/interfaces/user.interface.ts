import { userRoleInfo } from 'src/common/enums/userRole.enum';
import { userStatusInfo } from 'src/common/enums/userStatus.enum';

export interface UserInfo {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: userRoleInfo;
  status: userStatusInfo;
  isActive: boolean;
  isProfileComplete: boolean;
  profilePhoto: string | null;
}
